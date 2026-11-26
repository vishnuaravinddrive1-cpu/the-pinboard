import { asOwner, q } from './db.ts'
import { sign } from './sign.ts'
import { render } from './templates.ts'
import type { Deps } from './types.ts'

const DAILY_CAP = 95   // Resend free plan: 100/day. Keep headroom.
const WARN_AT = 80
const MAX_ATTEMPTS = 6

/** Sends due emails through Resend: throttled, retried with back-off, every result logged. Safe to run concurrently. */
export async function drainEmails(d: Deps, limit = 10): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!d.cfg.resendKey) return { sent: 0, failed: 0, skipped: 'RESEND_API_KEY not set; emails stay queued' }
  const [today] = await asOwner(d.db, q("select count(*)::int as n from email_queue where status = 'sent' and (sent_at at time zone 'Asia/Kolkata')::date = ist_today()"))
  let used = today[0].n as number
  if (used >= WARN_AT) {
    await asOwner(d.db, q("select enqueue_email(admin_email(), 'admin_quota_warning', jsonb_build_object('sent', $1::int, 'quota', 100), 'quota-' || ist_today()::text)", used))
  }
  const room = Math.max(0, Math.min(limit, DAILY_CAP - used))
  if (room === 0) return { sent: 0, failed: 0, skipped: 'daily cap reached; emails stay queued' }

  const [due] = await asOwner(d.db, q(
    `update email_queue set status = 'sending', attempts = attempts + 1, next_attempt_at = now()
      where id in (select id from email_queue
                    where (status in ('queued', 'failed') and next_attempt_at <= now())
                       or (status = 'sending' and next_attempt_at < now() - interval '10 minutes')
                    order by (template = 'login_code') desc, created_at limit $1 for update skip locked)
      returning id, to_email, template, payload, attempts`, room))
  let sent = 0, failed = 0
  for (const row of due) {
    try {
      const msg = await render(row.template, row.payload, {
        siteUrl: d.cfg.siteUrl, adminEmail: row.to_email,
        takedownUrl: async (id) => `${d.cfg.siteUrl}/takedown?id=${id}&t=${await sign(d.cfg.takedownSecret, id)}`,
      })
      const res = await d.fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${d.cfg.resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pinboard-${row.id}` },
        body: JSON.stringify({ from: d.cfg.fromEmail, to: [row.to_email], reply_to: d.cfg.replyTo, subject: msg.subject, html: msg.html }),
      })
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
      await asOwner(d.db,
        q("update email_queue set status = 'sent', sent_at = now(), last_error = null, payload = case when template = 'login_code' then '{}'::jsonb else payload end where id = $1", row.id),
        q("select log_event('system', 'email_sent', $1)", `${row.template} -> ${row.to_email}`))
      sent++; used++
    } catch (e) {
      const dead = row.attempts >= MAX_ATTEMPTS
      const backoffMin = Math.min(240, 2 ** row.attempts)
      await asOwner(d.db,
        q("update email_queue set status = $2, last_error = $3, next_attempt_at = now() + make_interval(mins => $4::int) where id = $1", row.id, dead ? 'dead' : 'failed', String(e).slice(0, 500), backoffMin),
        q("select log_event('system', 'email_failed', $1)", `${row.template} -> ${row.to_email}: ${String(e).slice(0, 200)}`))
      failed++
    }
  }
  return { sent, failed }
}
