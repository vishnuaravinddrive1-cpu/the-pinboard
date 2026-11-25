// One-click take-down from the admin email. GET shows a confirmation page; POST performs it.
// (A confirmation step stops mail scanners that pre-fetch links from taking posters down.)
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verify } from '../_shared/sign.ts'

const page = (body: string, status = 200) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Outfit,Helvetica,Arial,sans-serif;background:#F9F2E3;color:#312122;max-width:480px;margin:40px auto;padding:0 16px">${body}</body>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

Deno.serve(async (req) => {
  const url = new URL(req.url)
  let id = url.searchParams.get('id') ?? '', t = url.searchParams.get('t') ?? ''
  const secret = Deno.env.get('TAKEDOWN_SECRET') ?? Deno.env.get('CRON_SECRET')!
  if (req.method === 'POST') { const f = await req.formData(); id = String(f.get('id') ?? id); t = String(f.get('t') ?? t) }
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await verify(secret, id, t))) return page('<h1>Link not valid</h1>', 403)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: poster } = await sb.from('posters').select('title,status').eq('id', id).maybeSingle()
  if (!poster) return page('<h1>Poster not found</h1>', 404)
  if (req.method !== 'POST') {
    return page(`<h1>Take down this poster?</h1><p><strong>${esc(poster.title)}</strong> (currently ${esc(poster.status)})</p>
<form method="post"><input type="hidden" name="id" value="${id}"><input type="hidden" name="t" value="${esc(t)}">
<button style="background:#8a2b1d;color:#F9F2E3;border:0;padding:14px 22px;border-radius:10px;font:600 16px Outfit,sans-serif">Yes, take it down</button></form>`)
  }
  if (poster.status === 'live' || poster.status === 'waiting') {
    await sb.from('posters').update({ status: 'taken_down', taken_down_reason: 'Taken down by admin (email link)' }).eq('id', id)
    await sb.rpc('log_event', { p_actor: 'admin (email link)', p_action: 'poster_take_down', p_detail: poster.title })
  }
  return page(`<h1>Done</h1><p>“${esc(poster.title)}” is no longer on the board.</p>`)
})
