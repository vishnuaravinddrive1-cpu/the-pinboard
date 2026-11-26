import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { currentUser, endSession, requestCode, startSession, verifyCode } from './auth.ts'
import { asAnon, asOwner, asUser, describeDbError, q } from './db.ts'
import { drainEmails } from './email.ts'
import { sign, verify } from './sign.ts'
import { isWebp, MAX_IMAGE_BYTES } from './store.ts'
import { cleanName, istDate, randomToken, safeEqual } from './util.ts'
import type { Deps, User } from './types.ts'

type Vars = { Variables: { user: User } }

const POSTER_COLS = `id, title, event_date::text as event_date, booking_url, area, category, image_path, thumb_path, width, height`
const ADMIN_POSTER_COLS = `${POSTER_COLS}, status, views, clicks, organiser_id, organiser_name, organiser_email, queue_position::int as queue_position, taken_down_reason, created_at, coalesce(flags, array[]::text[]) as flags`
const MY_POSTER_COLS = `${POSTER_COLS}, status, views, clicks, organiser_id, queue_position::int as queue_position, taken_down_reason, created_at`

const img = (p: string) => (p ? `/img/${p}` : '')
const pub = (r: any) => ({
  id: r.id, title: r.title, event_date: r.event_date, booking_url: r.booking_url, area: r.area, category: r.category,
  image_url: img(r.image_path), thumb_url: img(r.thumb_path), width: r.width, height: r.height,
})
const full = (r: any) => ({ ...pub(r), status: r.status, views: r.views, clicks: r.clicks, organiser_id: r.organiser_id,
  organiser_name: r.organiser_name, organiser_email: r.organiser_email, queue_position: r.queue_position, taken_down_reason: r.taken_down_reason,
  created_at: r.created_at, flags: r.flags ?? [] })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const html = (body: string, status = 200) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Outfit,Helvetica,Arial,sans-serif;background:#FAF3E6;color:#382525;max-width:480px;margin:40px auto;padding:0 16px">${body}</body>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function createApp(d: Deps, extend?: (app: Hono<Vars>) => void) {
  const app = new Hono<Vars>()

  // ---------- security middleware ----------
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      // CSRF: browsers always send Origin on cross-site POSTs. It must be our own origin.
      const origin = c.req.header('origin')
      if (!origin || origin !== new URL(c.req.url).origin) return c.json({ error: 'Blocked: request did not come from this site.' }, 403)
    }
    await next()
    c.header('Cache-Control', c.res.headers.get('Cache-Control') ?? 'no-store')
    c.header('X-Content-Type-Options', 'nosniff')
  })
  app.onError((e, c) => {
    const { status, message } = describeDbError(e)
    if (status === 500) console.error('API error:', e?.message ?? e)
    return c.json({ error: message }, status as 400)
  })

  const needUser = async (c: Context<Vars>, next: () => Promise<void>) => {
    const u = await currentUser(d, c)
    if (!u) return c.json({ error: 'Please log in.' }, 401)
    c.set('user', u)
    await next()
  }
  const needAdmin = async (c: Context<Vars>, next: () => Promise<void>) => {
    const u = c.get('user')
    if (u.role !== 'admin' || u.status !== 'approved') return c.json({ error: 'Admins only.' }, 403)
    await next()
  }
  const kick = () => d.defer(drainEmails(d).catch((e) => console.error('email drain failed', e)))

  // ---------- public ----------
  app.get('/api/config', (c) => c.json({ service: 'pinboard', google: !!(d.cfg.googleId && d.cfg.googleSecret) }))

  app.get('/api/posters', async (c) => {
    const cache = (globalThis as any).caches?.default as Cache | undefined
    const key = new Request(`${new URL(c.req.url).origin}/__cache/posters/${istDate()}`)   // new key each IST day
    const hit = await cache?.match(key)
    if (hit) return hit
    const [rows] = await asAnon(d.db, q(`select ${POSTER_COLS} from public_posters`))
    const res = new Response(JSON.stringify(rows.map(pub)), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=0, must-revalidate, s-maxage=30' } })
    if (cache) d.defer(cache.put(key, res.clone()))
    return res
  })
  const count = (what: 'view' | 'click') => async (c: Context<Vars>) => {
    const id = c.req.param('id') ?? ''
    if (UUID.test(id)) await asAnon(d.db, q(`select record_${what}($1::uuid)`, id))
    return c.json({ ok: true })
  }
  app.post('/api/posters/:id/view', count('view'))
  app.post('/api/posters/:id/click', count('click'))
  app.post('/api/posters/:id/report', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    if (!UUID.test(c.req.param('id'))) return c.json({ error: 'Poster not found.' }, 404)
    await asAnon(d.db, q('select report_poster($1::uuid, $2)', c.req.param('id'), String(body.reason ?? '').slice(0, 500)))
    kick()
    return c.json({ ok: true })
  })

  app.get('/img/*', async (c) => {
    const key = decodeURIComponent(new URL(c.req.url).pathname.slice(5))
    if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(-t)?\.webp$/.test(key)) return c.notFound()
    const bytes = await d.store.get(key)
    if (!bytes) return c.notFound()
    return new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
  })

  // ---------- sign-in ----------
  app.post('/api/auth/request-code', async (c) => {
    const r = await requestCode(d, await c.req.json().catch(() => ({})))
    if ('error' in r) return c.json({ error: r.error }, r.status as 400)
    kick()
    return c.json({ ok: true })
  })
  app.post('/api/auth/verify', async (c) => {
    const r = await verifyCode(d, await c.req.json().catch(() => ({})))
    if ('error' in r) return c.json({ error: r.error }, r.status as 400)
    await startSession(d, c, r.userId)
    kick()
    return c.json({ ok: true })
  })
  app.post('/api/auth/logout', async (c) => { await endSession(d, c); return c.json({ ok: true }) })

  app.get('/api/auth/google', (c) => {
    if (!d.cfg.googleId || !d.cfg.googleSecret) return c.json({ error: 'Google sign-in is not set up.' }, 404)
    const state = randomToken(24)
    setCookie(c, 'pb_oauth', state, { httpOnly: true, sameSite: 'Lax', path: '/api/auth/google', maxAge: 600, secure: new URL(c.req.url).protocol === 'https:' })
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.search = new URLSearchParams({ client_id: d.cfg.googleId, redirect_uri: `${d.cfg.siteUrl}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString()
    return c.redirect(u.toString())
  })
  app.get('/api/auth/google/callback', async (c) => {
    const fail = (m: string) => c.redirect(`/organiser?error=${encodeURIComponent(m)}`)
    const state = c.req.query('state') ?? '', cookie = getCookie(c, 'pb_oauth') ?? ''
    deleteCookie(c, 'pb_oauth', { path: '/api/auth/google' })
    if (!cookie || !safeEqual(state, cookie) || !c.req.query('code')) return fail('Google sign-in was cancelled or expired.')
    const tok = await d.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: c.req.query('code')!, client_id: d.cfg.googleId!, client_secret: d.cfg.googleSecret!, redirect_uri: `${d.cfg.siteUrl}/api/auth/google/callback`, grant_type: 'authorization_code' }),
    })
    if (!tok.ok) return fail('Google sign-in failed. Please try again.')
    const idToken = ((await tok.json()) as any).id_token as string | undefined
    // The id_token came straight from Google's token endpoint over TLS, so its claims can be trusted without a signature check.
    let claims: any = {}
    try { claims = JSON.parse(atob((idToken ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { /* handled below */ }
    if (!claims.email || claims.email_verified !== true) return fail('Your Google email is not verified.')
    const [rows] = await asOwner(d.db, q('select register_user($1, $2, null, $3) as id', String(claims.email).toLowerCase(), cleanName(claims.name), d.cfg.bootstrapAdmin ?? null))
    await startSession(d, c, rows[0].id)
    kick()
    return c.redirect('/organiser')
  })

  // ---------- signed-in ----------
  app.get('/api/me', async (c) => c.json({ user: await currentUser(d, c) }))

  app.use('/api/my/*', needUser)
  app.use('/api/admin/*', needUser, needAdmin)
  app.use('/api/me/*', needUser)
  app.use('/api/posters/:id', needUser)       // PATCH (owner or admin; Row Level Security decides)
  app.use('/api/settings', needUser)

  app.post('/api/me/accept-terms', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    await asUser(d.db, c.get('user').id, q('select accept_terms($1)', String(body.version ?? '')))
    return c.json({ ok: true })
  })

  app.get('/api/settings', async (c) => {
    const [rows] = await asUser(d.db, c.get('user').id, q('select board_limit, reminder_days, admin_email, terms_version, retention_years, categories, areas from settings where id = 1'))
    return c.json(rows[0])
  })

  app.get('/api/my/posters', async (c) => {
    const [rows] = await asUser(d.db, c.get('user').id, q(`select ${MY_POSTER_COLS} from my_posters order by created_at desc`))
    return c.json(rows.map(full))
  })

  async function readImages(c: Context<Vars>) {
    const len = Number(c.req.header('content-length') ?? 0)
    if (len > 2 * MAX_IMAGE_BYTES + 50_000) throw Object.assign(new Error('That image is too large.'), { code: 'P0001' })
    const form = await c.req.formData()
    const files: Uint8Array[] = []
    for (const k of ['full', 'thumb']) {
      const f = form.get(k)
      if (!f || typeof f === 'string') throw Object.assign(new Error('Image missing.'), { code: 'P0001' })
      const b = new Uint8Array(await (f as File).arrayBuffer())
      if (b.length === 0 || b.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('That image is too large.'), { code: 'P0001' })
      if (!isWebp(b)) throw Object.assign(new Error('Only images prepared by the upload form are accepted.'), { code: 'P0001' })
      files.push(b)
    }
    return { form, full: files[0], thumb: files[1] }
  }

  app.post('/api/my/posters', async (c) => {
    const u = c.get('user')
    if (u.status !== 'approved') return c.json({ error: 'Your account is not approved yet.' }, 403)
    const { form, full: fullImg, thumb } = await readImages(c)
    let m: any
    try { m = JSON.parse(String(form.get('meta') ?? '{}')) } catch { return c.json({ error: 'Please check the details you entered.' }, 400) }
    const id = crypto.randomUUID()
    const fullKey = `${u.id}/${id}.webp`, thumbKey = `${u.id}/${id}-t.webp`
    await d.store.put(fullKey, fullImg); await d.store.put(thumbKey, thumb)
    try {
      const [rows] = await asUser(d.db, u.id, q('select * from create_poster($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10::int, $11::int, $12::int, $13::int)',
        cleanName(m.title, 120), String(m.event_date), m.booking_url || null, cleanName(m.area, 80), cleanName(m.area_other, 60), cleanName(m.category, 40),
        m.confirmed === true, fullKey, thumbKey, Number(m.width), Number(m.height), fullImg.length, thumb.length))
      kick()
      return c.json({ id: rows[0].id, status: rows[0].status, queue_position: rows[0].queue_position == null ? null : Number(rows[0].queue_position) })
    } catch (e) { await d.store.delete([fullKey, thumbKey]).catch(() => {}); throw e }
  })

  app.post('/api/my/posters/:id/image', async (c) => {
    const u = c.get('user'); const id = c.req.param('id')
    if (!UUID.test(id)) return c.json({ error: 'Poster not found.' }, 404)
    const { form, full: fullImg, thumb } = await readImages(c)
    const key = crypto.randomUUID(); const fullKey = `${u.id}/${key}.webp`, thumbKey = `${u.id}/${key}-t.webp`
    await d.store.put(fullKey, fullImg); await d.store.put(thumbKey, thumb)
    try {
      const [rows] = await asUser(d.db, u.id, q('update posters set image_path = $2, thumb_path = $3, image_bytes = $4::int, thumb_bytes = $5::int, width = $6::int, height = $7::int where id = $1::uuid returning id',
        id, fullKey, thumbKey, fullImg.length, thumb.length, Number(form.get('width')), Number(form.get('height'))))
      if (!rows.length) { await d.store.delete([fullKey, thumbKey]); return c.json({ error: 'Poster not found.' }, 404) }
      return c.json({ ok: true })
    } catch (e) { await d.store.delete([fullKey, thumbKey]).catch(() => {}); throw e }
  })

  app.delete('/api/my/posters/:id', async (c) => {
    if (!UUID.test(c.req.param('id'))) return c.json({ error: 'Poster not found.' }, 404)
    await asUser(d.db, c.get('user').id, q('select delete_poster($1::uuid)', c.req.param('id')))
    kick()
    return c.json({ ok: true })
  })

  app.patch('/api/posters/:id', async (c) => {
    const id = c.req.param('id'); const b = await c.req.json().catch(() => ({}))
    if (!UUID.test(id)) return c.json({ error: 'Poster not found.' }, 404)
    const url = b.booking_url === undefined ? null : b.booking_url
    if (url && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(url)) return c.json({ error: 'The booking link must start with https://' }, 400)
    const [rows] = await asUser(d.db, c.get('user').id, q(
      `update posters set title = coalesce($2, title), event_date = coalesce($3::date, event_date),
              booking_url = case when $4::boolean then $5 else booking_url end where id = $1::uuid returning id`,
      id, b.title === undefined ? null : cleanName(b.title, 120), b.event_date === undefined ? null : String(b.event_date), b.booking_url !== undefined, url || null))
    if (!rows.length) return c.json({ error: 'Poster not found.' }, 404)
    return c.json({ ok: true })
  })

  // ---------- admin ----------
  const adm = (c: Context<Vars>, ...s: ReturnType<typeof q>[]) => asUser(d.db, c.get('user').id, ...s)
  app.get('/api/admin/stats', async (c) => c.json((await adm(c, q('select admin_stats() as s')))[0][0].s))
  app.get('/api/admin/posters', async (c) => c.json((await adm(c, q(`select ${ADMIN_POSTER_COLS} from admin_posters order by event_date, created_at`)))[0].map(full)))
  app.get('/api/admin/organisers', async (c) => c.json((await adm(c, q('select id, email, display_name, role, status, terms_version, terms_accepted_at, created_at, poster_count::int as poster_count from admin_organisers order by created_at desc')))[0]))
  app.get('/api/admin/logs', async (c) => c.json((await adm(c, q('select id, at, actor, action, detail from activity_log order by at desc limit 500')))[0]))
  app.get('/api/admin/emails', async (c) => c.json((await adm(c, q(
    `select id, to_email as "to", template, case when status = 'sent' then 'sent' when status in ('queued','sending') then 'queued' else 'failed' end as status,
            attempts, created_at, last_error as error from email_queue order by created_at desc limit 300`)))[0]))
  app.get('/api/admin/reports', async (c) => c.json((await adm(c, q(
    'select r.id, r.poster_id, p.title as poster_title, r.reason, r.created_at, r.handled from reports r join posters p on p.id = r.poster_id order by r.created_at desc limit 200')))[0]))
  app.put('/api/admin/settings', async (c) => {
    const s = await c.req.json().catch(() => ({}))
    await adm(c, q(
      `update settings set board_limit = $1::int, reminder_days = $2::int, admin_email = $3, terms_version = $4, retention_years = $5::int, categories = $6::text[], areas = $7::text[] where id = 1`,
      Number(s.board_limit), Number(s.reminder_days), String(s.admin_email), String(s.terms_version), Number(s.retention_years),
      (s.categories ?? []).map((x: unknown) => cleanName(x, 40)), (s.areas ?? []).map((x: unknown) => cleanName(x, 80))))
    await asOwner(d.db, q('select promote_waiting()'))   // a higher board limit lets queued posters in straight away
    return c.json({ ok: true })
  })
  app.post('/api/admin/organisers/:id/status', async (c) => {
    const b = await c.req.json().catch(() => ({}))
    if (!UUID.test(c.req.param('id'))) return c.json({ error: 'Organiser not found.' }, 404)
    await adm(c, q('select admin_set_organiser_status($1::uuid, $2::organiser_status, $3)', c.req.param('id'), String(b.status), b.reason ? String(b.reason).slice(0, 300) : null))
    kick()
    return c.json({ ok: true })
  })
  app.post('/api/admin/posters/:id/action', async (c) => {
    const b = await c.req.json().catch(() => ({}))
    if (!UUID.test(c.req.param('id'))) return c.json({ error: 'Poster not found.' }, 404)
    await adm(c, q('select admin_poster_action($1::uuid, $2, $3)', c.req.param('id'), String(b.action), b.arg == null ? null : String(b.arg).slice(0, 300)))
    kick()
    return c.json({ ok: true })
  })

  // ---------- one-click take-down from the admin email (signed link; confirmation page first) ----------
  const takedown = async (c: Context<Vars>) => {
    let id = c.req.query('id') ?? '', t = c.req.query('t') ?? ''
    if (c.req.method === 'POST') { const f = await c.req.formData(); id = String(f.get('id') ?? id); t = String(f.get('t') ?? t) }
    if (!UUID.test(id) || !(await verify(d.cfg.takedownSecret, id, t))) return html('<h1>Link not valid</h1>', 403)
    const [rows] = await asOwner(d.db, q('select title, status from posters where id = $1::uuid', id))
    const p = rows[0]; if (!p) return html('<h1>Poster not found</h1>', 404)
    if (c.req.method !== 'POST') {
      return html(`<h1>Take down this poster?</h1><p><strong>${esc(p.title)}</strong> (currently ${esc(p.status)})</p><form method="post"><input type="hidden" name="id" value="${id}"><input type="hidden" name="t" value="${esc(t)}"><button style="background:#8a2b1d;color:#FAF3E6;border:0;padding:14px 22px;border-radius:10px;font:600 16px Outfit,sans-serif">Yes, take it down</button></form>`)
    }
    if (c.req.header('origin') && c.req.header('origin') !== new URL(c.req.url).origin) return html('<h1>Blocked</h1>', 403)
    if (p.status === 'live' || p.status === 'waiting') {
      await asOwner(d.db,
        q("update posters set status = 'taken_down', taken_down_reason = 'Taken down by admin (email link)' where id = $1::uuid", id),
        q("select log_event('admin (email link)', 'poster_take_down', $1)", p.title))
    }
    return html(`<h1>Done</h1><p>“${esc(p.title)}” is no longer on the board.</p>`)
  }
  app.get('/takedown', takedown)
  app.post('/takedown', takedown)

  extend?.(app)   // test-only routes (never used in production)
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404))

  // Anything else: the website (single-page app with fallback to index.html).
  app.all('*', (c) => (d.assets ? d.assets.fetch(c.req.raw) : c.notFound()))
  return app
}
export { sign }
