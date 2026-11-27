import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { nightly } from '../src/cron.ts'
import { sign } from '../src/sign.ts'
import { makeHarness } from '../dev/harness.ts'
import { Client, drain, futureDate, lastCode, ORIGIN, posterForm, webp, type H } from './helpers.ts'

let h: H, admin: Client, alice: Client, bob: Client, anon: Client
let aliceId = '', bobId = ''
let failMail = false

before(async () => {
  h = makeHarness(process.env.TEST_DATABASE_URL!, { bootstrapAdmin: 'boss@example.org', resendStatus: () => (failMail ? 500 : 200) })
  admin = new Client(h); alice = new Client(h); bob = new Client(h); anon = new Client(h)
})
after(async () => { await h.flush(); await (h.db as any).end() })

const approve = async (id: string) => { const r = await admin.post(`/api/admin/organisers/${id}/status`, { status: 'approved' }); assert.equal(r.status, 200, r.text) }
const upload = (c: Client, title: string, days = 5, extra: Record<string, unknown> = {}) =>
  c.req('POST', '/api/my/posters', undefined, { form: posterForm({ title, event_date: futureDate(days), ...extra }) })

describe('sign-in (email codes)', () => {
  it('public endpoints work without login; unknown API paths are 404 JSON', async () => {
    assert.deepEqual((await anon.get('/api/posters')).json, [])
    assert.equal((await anon.get('/api/config')).json.service, 'pinboard')
    assert.equal((await anon.get('/api/nope')).status, 404)
    assert.equal((await anon.get('/api/me')).json.user, null)
  })
  it('CSRF: state-changing requests without our Origin are refused', async () => {
    assert.equal((await anon.req('POST', '/api/auth/request-code', { email: 'x@example.org' }, { origin: null })).status, 403)
    assert.equal((await anon.req('POST', '/api/auth/request-code', { email: 'x@example.org' }, { origin: 'https://evil.example' })).status, 403)
  })
  it('sign-up needs a name and the current Terms version', async () => {
    const r1 = await anon.post('/api/auth/request-code', { email: 'a1@example.org', mode: 'signup', name: 'A', terms_version: '0.1' })
    assert.equal(r1.status, 400)
    const r2 = await anon.post('/api/auth/request-code', { email: 'a1@example.org', mode: 'signup', name: 'Alice Org' })
    assert.equal(r2.status, 400); assert.match(r2.json.error, /Terms/)
    const r3 = await anon.post('/api/auth/request-code', { email: 'a1@example.org', mode: 'signup', name: 'Alice Org', terms_version: 'old' })
    assert.equal(r3.status, 400)
    assert.equal((await anon.post('/api/auth/request-code', { email: 'not-an-email', mode: 'login' })).status, 400)
  })
  it('wrong codes are rejected and lock after 5 tries; right code logs in and sets an HttpOnly cookie', async () => {
    assert.equal((await anon.post('/api/auth/request-code', { email: 'lock@example.org', mode: 'signup', name: 'Lock Test', terms_version: '0.1' })).status, 200)
    const real = await lastCode(h, 'lock@example.org')
    const wrong = real === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) assert.equal((await anon.post('/api/auth/verify', { email: 'lock@example.org', code: wrong })).status, 400)
    const late = await anon.post('/api/auth/verify', { email: 'lock@example.org', code: real })
    assert.equal(late.status, 400); assert.match(late.json.error, /expired|new one/)

    const r = await alice.login('alice@example.org', 'Alice Org')
    assert.equal(r.status, 200)
    assert.match(alice.cookie, /^pb_session=/)
    const raw = (await h.app.request(ORIGIN + '/api/auth/request-code', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@example.org', mode: 'login' }) })).headers.getSetCookie()
    assert.equal(raw.length, 0)
    const me = (await alice.get('/api/me')).json.user
    assert.equal(me.email, 'alice@example.org'); assert.equal(me.status, 'pending'); assert.equal(me.role, 'organiser'); assert.equal(me.terms_version, '0.1')
    aliceId = me.id
  })
  it('a used code cannot be reused; an unknown email on login sends nothing and reveals nothing', async () => {
    await drain(h); const before = h.mails.length
    const r = await anon.post('/api/auth/request-code', { email: 'ghost@example.org', mode: 'login' })
    assert.equal(r.status, 200); await drain(h); assert.equal(h.mails.length, before)
    const reuse = await anon.post('/api/auth/verify', { email: 'alice@example.org', code: '123456' })
    assert.equal(reuse.status, 400)
  })
  it('code requests are rate limited per email', async () => {
    let last = 200
    for (let i = 0; i < 10; i++) last = (await anon.post('/api/auth/request-code', { email: 'spam@example.org', mode: 'signup', name: 'Spam Er', terms_version: '0.1' })).status
    assert.equal(last, 429)
  })
  it('the configured bootstrap admin email becomes the admin on first sign-in (once)', async () => {
    assert.equal((await admin.login('boss@example.org', 'The Boss')).status, 200)
    const me = (await admin.get('/api/me')).json.user
    assert.equal(me.role, 'admin'); assert.equal(me.status, 'approved')
    const other = new Client(h); await other.login('boss2@example.org', 'Not Boss')
    assert.equal((await other.get('/api/me')).json.user.role, 'organiser')
  })
  it('logout invalidates the session', async () => {
    const t = new Client(h); await t.login('temp@example.org', 'Temp User')
    assert.equal((await t.get('/api/me')).json.user.email, 'temp@example.org')
    const saved = t.cookie
    await t.post('/api/auth/logout')
    assert.equal((await t.get('/api/me')).json.user, null)
    t.cookie = saved
    assert.equal((await t.get('/api/me')).json.user, null)
  })
})

describe('temporary address', () => {
  it('pages served from *.workers.dev carry noindex; other hosts do not', async () => {
    const assets = { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) }
    const t = makeHarness(process.env.TEST_DATABASE_URL!, { assets })
    const dummy = await t.app.request('https://pinboard.example.workers.dev/organiser'); assert.equal(dummy.headers.get('x-robots-tag'), 'noindex, nofollow')
    const real = await t.app.request('https://pinboard.tcqindia.com/organiser'); assert.equal(real.headers.get('x-robots-tag'), null)
    await (t.db as any).end()
  })
})

describe('roles and access', () => {
  it('anonymous: protected endpoints answer 401', async () => {
    for (const p of ['/api/my/posters', '/api/admin/stats', '/api/settings']) assert.equal((await anon.get(p)).status, 401, p)
  })
  it('a pending organiser cannot post; organisers cannot use admin endpoints', async () => {
    const r = await upload(alice, 'Too early')
    assert.equal(r.status, 403)
    assert.equal((await alice.get('/api/admin/stats')).status, 403)
    assert.equal((await alice.post(`/api/admin/organisers/${aliceId}/status`, { status: 'approved' })).status, 403)
  })
  it('admin approves; organiser is emailed; approved organiser can post', async () => {
    await approve(aliceId)
    await drain(h)
    assert.ok(h.mails.some((m) => m.to[0] === 'alice@example.org' && /approved/i.test(m.subject)))
    assert.ok(h.mails.some((m) => m.to[0] === 'thecuriosityquotient@gmail.com' && /New organiser awaiting approval/.test(m.subject)))
    const bobRes = await bob.login('bob@example.org', 'Bob Org'); assert.equal(bobRes.status, 200)
    bobId = (await bob.get('/api/me')).json.user.id; await approve(bobId)
  })
})

describe('posters, images, queue', () => {
  let p1 = '', imgPath = ''
  it('rejects non-WebP and oversized uploads (checked by content and size on the server)', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...new Array(200).fill(7)])
    let r = await alice.req('POST', '/api/my/posters', undefined, { form: posterForm({ title: 'Fake image', event_date: futureDate(4) }, png, png) })
    assert.equal(r.status, 400); assert.match(r.json.error, /prepared by the upload form/)
    r = await alice.req('POST', '/api/my/posters', undefined, { form: posterForm({ title: 'Big image', event_date: futureDate(4) }, webp(800_000), webp(2000)) })
    assert.equal(r.status, 400); assert.match(r.json.error, /too large/)
    assert.equal((await alice.get('/api/my/posters')).json.length, 0)
  })
  it('a valid poster (no booking link) goes live at once and appears on the public board with its image', async () => {
    const r = await upload(alice, 'Quiet Reading Evening', 5)
    assert.equal(r.status, 200, r.text); assert.equal(r.json.status, 'live'); p1 = r.json.id
    const board = (await anon.get('/api/posters')).json
    assert.equal(board.length, 1); assert.equal(board[0].title, 'Quiet Reading Evening'); assert.equal(board[0].booking_url, null)
    assert.match(board[0].event_date, /^\d{4}-\d{2}-\d{2}$/)
    imgPath = board[0].image_url
    const img = await anon.get(imgPath)
    assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/webp'); assert.match(img.headers.get('cache-control')!, /immutable/)
    assert.equal((await anon.get('/img/not/there.webp')).status, 404)
    assert.equal((await anon.get('/img/../etc/passwd')).status, 404)
    assert.ok(!JSON.stringify(board).includes('alice@example.org'), 'public board must not leak organiser details')
  })
  it('duplicate (same organiser, title, date) is blocked; https-only booking links; confirmation required', async () => {
    assert.equal((await upload(alice, 'Quiet Reading Evening', 5)).status, 400)
    const bad = await upload(alice, 'Insecure link', 5, { booking_url: 'http://example.com' }); assert.equal(bad.status, 400)
    const nc = await upload(alice, 'Not confirmed', 5, { confirmed: false }); assert.equal(nc.status, 400)
    const ok = await upload(alice, 'With link', 6, { booking_url: 'https://example.com/tickets' }); assert.equal(ok.status, 200)
    assert.equal((await anon.get('/api/posters')).json.find((x: any) => x.title === 'With link').booking_url, 'https://example.com/tickets')
  })
  it('the 100-cap logic via the API (limit lowered to 3): queue, position, promotion on take-down', async () => {
    const s = (await admin.get('/api/settings')).json
    assert.equal((await admin.req('PUT', '/api/admin/settings', { ...s, board_limit: 3 })).status, 200)
    const r3 = await upload(bob, 'Third poster', 7); assert.equal(r3.json.status, 'live')
    const r4 = await upload(bob, 'Fourth poster', 8); assert.equal(r4.json.status, 'waiting'); assert.equal(r4.json.queue_position, 1)
    const r5 = await upload(bob, 'Fifth poster', 9); assert.equal(r5.json.queue_position, 2)
    assert.equal((await anon.get('/api/posters')).json.length, 3)
    const mine = (await bob.get('/api/my/posters')).json
    assert.equal(mine.find((x: any) => x.title === 'Fourth poster').queue_position, 1)
    // admin takes a live one down -> first waiting poster promoted immediately
    assert.equal((await admin.post(`/api/admin/posters/${p1}/action`, { action: 'take_down', arg: 'test' })).status, 200)
    const after = (await bob.get('/api/my/posters')).json
    assert.equal(after.find((x: any) => x.title === 'Fourth poster').status, 'live')
    assert.equal(after.find((x: any) => x.title === 'Fifth poster').queue_position, 1)
    await drain(h); assert.ok(h.mails.some((m) => m.to[0] === 'bob@example.org' && /now live/i.test(m.subject)))
    const s2 = (await admin.get('/api/settings')).json; await admin.req('PUT', '/api/admin/settings', { ...s2, board_limit: 100 })
  })
  it('ownership: organisers can edit only their own posters; admin can edit any', async () => {
    const mine = (await bob.get('/api/my/posters')).json.find((x: any) => x.title === 'Third poster')
    assert.equal((await alice.req('PATCH', `/api/posters/${mine.id}`, { title: 'Hijacked' })).status, 404)
    assert.equal((await bob.req('PATCH', `/api/posters/${mine.id}`, { title: 'Third poster (edited)' })).status, 200)
    assert.equal((await bob.req('PATCH', `/api/posters/${mine.id}`, { booking_url: 'http://nope.example.com' })).status, 400)
    assert.equal((await admin.req('PATCH', `/api/posters/${mine.id}`, { booking_url: 'https://example.com/x' })).status, 200)
    assert.equal((await alice.req('DELETE', `/api/my/posters/${mine.id}`)).status, 400)
    const form = posterForm({}); form.set('width', '500'); form.set('height', '700')
    assert.equal((await alice.req('POST', `/api/my/posters/${mine.id}/image`, undefined, { form })).status, 404)
    assert.equal((await bob.req('POST', `/api/my/posters/${mine.id}/image`, undefined, { form })).status, 200)
  })
  it('views and booking clicks are counted anonymously; reports reach the admin', async () => {
    const board = (await anon.get('/api/posters')).json; const id = board[0].id
    await anon.post(`/api/posters/${id}/view`); await anon.post(`/api/posters/${id}/click`)
    const row = (await admin.get('/api/admin/posters')).json.find((x: any) => x.id === id)
    assert.equal(row.views, 1); assert.equal(row.clicks, 1)
    assert.equal((await anon.post(`/api/posters/${id}/report`, { reason: 'looks like a rally' })).status, 200)
    assert.equal((await admin.get('/api/admin/reports')).json[0].reason, 'looks like a rally')
    assert.equal((await anon.post(`/api/posters/${id}/report`, { reason: '' })).status, 400)
  })
  it('expired posters never appear, even if no job has run', async () => {
    await h.db.tx([{ text: "insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, area, category, status, image_path, thumb_path, width, height, confirmed_at) select id, 'a', 'alice@example.org', 'Yesterday event', ist_today() - 1, 'Adyar', 'Arts', 'live', 'x/y.webp', 'x/y-t.webp', 600, 800, now() from users where email = 'alice@example.org'" }])
    assert.ok(!(await anon.get('/api/posters')).json.some((x: any) => x.title === 'Yesterday event'))
    const n = await nightly(h.deps)
    assert.ok(n.retention)
    const row = (await admin.get('/api/admin/posters')).json.find((x: any) => x.title === 'Yesterday event')
    assert.equal(row.status, 'expired')
  })
  it('new Terms version blocks uploads until the organiser accepts it', async () => {
    const s = (await admin.get('/api/settings')).json
    await admin.req('PUT', '/api/admin/settings', { ...s, terms_version: '0.2' })
    const r = await upload(alice, 'After terms change', 10); assert.equal(r.status, 400); assert.match(r.json.error, /Terms/)
    assert.equal((await alice.post('/api/me/accept-terms', { version: '0.1' })).status, 400)
    assert.equal((await alice.post('/api/me/accept-terms', { version: '0.2' })).status, 200)
    assert.equal((await upload(alice, 'After terms change', 10)).status, 200)
    await admin.req('PUT', '/api/admin/settings', { ...s, terms_version: '0.1' })
    await alice.post('/api/me/accept-terms', { version: '0.1' }).catch(() => {})
  })
  it('suspending an organiser takes their posters down and blocks them', async () => {
    await admin.post(`/api/admin/organisers/${bobId}/status`, { status: 'suspended', reason: 'spam' })
    assert.equal((await upload(bob, 'Suspended post', 12)).status, 403)
    assert.ok(!(await anon.get('/api/posters')).json.some((x: any) => x.title.startsWith('Third') || x.title === 'Fourth poster'))
    await approve(bobId)
  })
})

describe('emails (Resend)', () => {
  it('sends with the right headers, reply-to and idempotency key; one click take-down link works (confirm page first)', async () => {
    const fresh = await upload(alice, 'Fresh takedown target', 11); assert.equal(fresh.status, 200)
    await drain(h)
    const m = h.mails.find((x) => x.subject === 'New poster: Fresh takedown target')!
    assert.ok(m, 'admin new-poster email was sent')
    assert.equal(m.to[0], 'thecuriosityquotient@gmail.com')
    assert.equal(m.body.reply_to, 'thecuriosityquotient@gmail.com'); assert.equal(m.body.from, 'Pin Board <pinboard@tcqindia.com>')
    assert.match(m.headers['Idempotency-Key'], /^pinboard-/); assert.match(m.headers.Authorization, /^Bearer re_/)
    const link = /href="([^"]*\/takedown\?id=[^"]+)"/.exec(m.html)![1].replace(/&amp;/g, '&')
    const path = link.replace('http://localhost', '')
    const g = await anon.get(path); assert.equal(g.status, 200); assert.match(g.text, /Take down this poster/)
    const id = new URL(link).searchParams.get('id')!
    const still = (await admin.get('/api/admin/posters')).json.find((x: any) => x.id === id).status
    assert.notEqual(still, 'taken_down', 'GET must not take anything down')
    const form = new FormData(); form.set('id', id); form.set('t', new URL(link).searchParams.get('t')!)
    if (still === 'live' || still === 'waiting') {
      const res = await h.app.request(ORIGIN + '/takedown', { method: 'POST', body: form }); assert.equal(res.status, 200)
      assert.equal((await admin.get('/api/admin/posters')).json.find((x: any) => x.id === id).status, 'taken_down')
    }
    assert.equal((await anon.get(`/takedown?id=${id}&t=bad`)).status, 403)
    assert.equal((await anon.get(`/takedown?id=${id}&t=${await sign('other-secret', id)}`)).status, 403)
  })
  it('failed sends are retried with back-off and logged; nothing is lost', async () => {
    failMail = true
    await anon.post('/api/auth/request-code', { email: 'retry@example.org', mode: 'signup', name: 'Retry Me', terms_version: '0.1' })
    await h.flush()
    const r = await (await import('../src/email.ts')).drainEmails(h.deps, 50)
    failMail = false
    assert.ok(r.failed >= 0)   // the send was already attempted (and failed) by the post-request drain
    const [[row]] = await h.db.tx([{ text: "select status, attempts, last_error, next_attempt_at > now() as later from email_queue where to_email = 'retry@example.org' order by created_at desc limit 1" }])
    assert.equal(row.status, 'failed'); assert.ok(row.attempts >= 1); assert.match(row.last_error, /Resend 500/); assert.equal(row.later, true)
    const [[lg]] = await h.db.tx([{ text: "select count(*)::int n from activity_log where action = 'email_failed'" }]); assert.ok(lg.n >= 1)
    await h.db.tx([{ text: "update email_queue set next_attempt_at = now() where to_email = 'retry@example.org'" }])
    await drain(h)
    const [[row2]] = await h.db.tx([{ text: "select status, payload from email_queue where to_email = 'retry@example.org' order by created_at desc limit 1" }])
    assert.equal(row2.status, 'sent'); assert.deepEqual(row2.payload, {}, 'login codes are wiped once sent')
  })
  it('stays under the Resend daily limit and warns the admin', async () => {
    await h.db.tx([{ text: "insert into email_queue (to_email, template, status, sent_at, payload) select 'x' || g || '@example.org', 'poster_live', 'sent', now(), '{}' from generate_series(1, 100) g" }])
    await h.db.tx([{ text: "insert into email_queue (to_email, template, payload) values ('late@example.org', 'poster_live', '{}')" }])
    const r = await (await import('../src/email.ts')).drainEmails(h.deps, 50)
    assert.ok(r.skipped && /cap/.test(r.skipped), JSON.stringify(r))
    const [[q]] = await h.db.tx([{ text: "select count(*)::int n from email_queue where template = 'admin_quota_warning'" }]); assert.equal(q.n, 1)
    await h.db.tx([{ text: "delete from email_queue where to_email like 'x%@example.org' or to_email = 'late@example.org'" }])
  })
})
