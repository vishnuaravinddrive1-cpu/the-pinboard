// Drains the email_queue through Resend: throttled, retried, logged. Called every minute by pg_cron (via pg_net).
// Secrets (supabase secrets set ...): RESEND_API_KEY, CRON_SECRET, SITE_URL, FROM_EMAIL, REPLY_TO, TAKEDOWN_SECRET
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sign } from '../_shared/sign.ts'
import { render } from '../_shared/templates.ts'

const DAILY_CAP = 95        // Resend free plan: 100/day. Keep a little headroom for retries.
const PER_RUN = 8           // throttle: at most 8 per minute
const WARN_AT = 80
const MAX_ATTEMPTS = 6

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
  const from = Deno.env.get('FROM_EMAIL') ?? 'Pin Board <pinboard@tcqindia.com>'
  const replyTo = Deno.env.get('REPLY_TO') ?? 'thecuriosityquotient@gmail.com'
  const functionsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`
  const tdSecret = Deno.env.get('TAKEDOWN_SECRET') ?? Deno.env.get('CRON_SECRET')!

  // How many already went out today (IST)?
  const startIst = new Date(); startIst.setUTCHours(18, 30, 0, 0); if (startIst > new Date()) startIst.setUTCDate(startIst.getUTCDate() - 1)
  const { count: sentToday } = await sb.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', startIst.toISOString())
  let used = sentToday ?? 0
  const room = Math.max(0, Math.min(PER_RUN, DAILY_CAP - used))

  if (used >= WARN_AT) {
    await sb.rpc('enqueue_email', { p_to: (await sb.from('settings').select('admin_email').eq('id', 1).single()).data!.admin_email,
      p_template: 'admin_quota_warning', p_payload: { sent: used, quota: 100 }, p_dedupe: 'quota-' + startIst.toISOString().slice(0, 10) })
  }
  if (room === 0) return Response.json({ sent: 0, reason: 'daily cap reached; emails stay queued' })

  const { data: due } = await sb.from('email_queue').select('*').in('status', ['queued', 'failed'])
    .lte('next_attempt_at', new Date().toISOString()).order('created_at').limit(room)
  let sent = 0, failed = 0
  for (const row of due ?? []) {
    // claim the row so two overlapping runs never send the same email
    const { data: claimed } = await sb.from('email_queue').update({ status: 'sending', attempts: row.attempts + 1 }).eq('id', row.id).in('status', ['queued', 'failed']).select('id')
    if (!claimed?.length) continue
    try {
      const msg = await render(row.template, row.payload, {
        siteUrl, adminEmail: row.to_email,
        takedownUrl: async (id) => `${functionsUrl}/takedown?id=${id}&t=${await sign(tdSecret, id)}`,
      })
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pinboard-${row.id}` },
        body: JSON.stringify({ from, to: [row.to_email], reply_to: replyTo, subject: msg.subject, html: msg.html }),
      })
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
      await sb.from('email_queue').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id)
      await sb.rpc('log_event', { p_actor: 'system', p_action: 'email_sent', p_detail: `${row.template} -> ${row.to_email}` })
      sent++; used++
    } catch (e) {
      const attempts = row.attempts + 1, dead = attempts >= MAX_ATTEMPTS
      const backoffMin = Math.min(240, 2 ** attempts)   // 2, 4, 8, 16, 32 ... minutes
      await sb.from('email_queue').update({ status: dead ? 'dead' : 'failed', last_error: String(e).slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString() }).eq('id', row.id)
      await sb.rpc('log_event', { p_actor: 'system', p_action: 'email_failed', p_detail: `${row.template} -> ${row.to_email}: ${String(e).slice(0, 200)}` })
      failed++
    }
  }
  return Response.json({ sent, failed, usedToday: used })
})
