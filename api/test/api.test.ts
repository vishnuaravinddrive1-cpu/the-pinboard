import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { nightly } from '../src/cron.ts'
import { makeHarness } from '../dev/harness.ts'
import { Client, futureDate, ORIGIN, posterForm, webp, type H } from './helpers.ts'

const SETUP_KEY = 'setup-key-0123456789-abcdefghijklmnopqrstuvwxyz'
let h: H, admin: Client, alice: Client, bob: Client, anon: Client
let aliceId = '', bobId = ''

before(async () => {
  h = makeHarness(process.env.TEST_DATABASE_URL!, { setupKey: SETUP_KEY, bootstrapAdmin: 'boss@example.org' })
  admin = new Client(h); alice = new Client(h); bob = new Client(h); anon = new Client(h)
})
after(async () => { await h.flush(); await (h.db as any).end() })

const outbox = async (status = 'queued') => (await admin.get(`/api/admin/outbox?status=${status}`)).json as { id: string; to: string; template: string; subject: string; text: string; status: string }[]
const linkIn = (text: string) => /(https?:\/\/\S+\/organiser\?link=\S+)/.exec(text)![1]
const requestAccess = (c: Client, email: string, name: string, terms = '0.1') => c.post('/api/auth/signup', { email, name, terms_version: terms })
const orgId = async (email: string) => ((await admin.get('/api/admin/organisers')).json as any[]).find((o) => o.email === email).id as string
const approve = async (id: string) => { const r = await admin.post(`/api/admin/organisers/${id}/status`, { status: 'approved' }); assert.equal(r.status, 200, r.text) }
const upload = (c: Client, title: string, days = 5, extra: Record<string, unknown> = {}) =>
  c.req('POST', '/api/my/posters', undefined, { form: posterForm({ title, event_date: futureDate(days), ...extra }) })

describe('first admin set-up and request access', () => {
  it('public endpoints work without login; unknown API paths are 404 JSON; the app never sends email', async () => {
    assert.deepEqual((await anon.get('/api/posters')).json, [])
    const cfg = (await anon.get('/api/config')).json; assert.equal(cfg.service, 'pinboard'); assert.equal(cfg.email, 'manual')
    assert.equal((await anon.get('/api/nope')).status, 404)
    assert.equal((await anon.get('/api/me')).json.user, null)
  })
  it('CSRF: state-changing requests without our Origin are refused', async () => {
    assert.equal((await anon.req('POST', '/api/auth/signup', { email: 'x@example.org' }, { origin: null })).status, 403)
    assert.equal((await anon.req('POST', '/api/auth/signup', { email: 'x@example.org' }, { origin: 'https://evil.example' })).status, 403)
  })
  it('admin set-up: needs the secret key, works once, signs the admin in and returns a personal link', async () => {
    assert.equal((await admin.post('/api/auth/setup', { key: 'wrong' })).status, 403)
    const r = await admin.post('/api/auth/setup', { key: SETUP_KEY })
    assert.equal(r.status, 200, r.text); assert.match(r.json.link, /\/organiser\?link=/)
    const me = (await admin.get('/api/me')).json.user
    assert.equal(me.email, 'boss@example.org'); assert.equal(me.role, 'admin'); assert.equal(me.status, 'approved')
    const again = await new Client(h).post('/api/auth/setup', { key: SETUP_KEY })
    assert.equal(again.status, 400); assert.match(again.json.error, /already exists/)
    // the link works on another device
    const phone = new Client(h); assert.equal((await phone.useLink(r.json.link)).status, 200)
    assert.equal((await phone.get('/api/me')).json.user.role, 'admin')
  })
  it('admin set-up is off unless configured', async () => {
    const t = makeHarness(process.env.TEST_DATABASE_URL!)
    assert.equal((await new Client(t).post('/api/auth/setup', { key: SETUP_KEY })).status, 404)
    await (t.db as any).end()
  })
  it('request access needs a name, an email and the current Terms version', async () => {
    assert.equal((await requestAccess(anon, 'not-an-email', 'Alice Org')).status, 400)
    assert.equal((await requestAccess(anon, 'alice@example.org', 'A')).status, 400)
    const noTerms = await anon.post('/api/auth/signup', { email: 'alice@example.org', name: 'Alice Org' }); assert.equal(noTerms.status, 400); assert.match(noTerms.json.error, /Terms/)
    assert.equal((await requestAccess(anon, 'alice@example.org', 'Alice Org', 'old')).status, 400)
  })
  it('request access creates a PENDING account without logging anyone in; repeating it changes nothing', async () => {
    const r = await requestAccess(anon, 'alice@example.org', 'Alice Org'); assert.equal(r.status, 200)
    assert.equal(anon.cookie, ''); assert.equal((await anon.get('/api/me')).json.user, null)
    const o = ((await admin.get('/api/admin/organisers')).json as any[]).find((x) => x.email === 'alice@example.org')
    assert.equal(o.status, 'pending'); assert.equal(o.terms_version, '0.1'); aliceId = o.id
    assert.equal((await requestAccess(anon, 'alice@example.org', 'Someone Else')).status, 200)
    assert.equal(((await admin.get('/api/admin/organisers')).json as any[]).filter((x) => x.email === 'alice@example.org').length, 1)
    assert.equal(((await admin.get('/api/admin/organisers')).json as any[]).find((x) => x.email === 'alice@example.org').display_name, 'Alice Org')
  })
  it('a pending organiser has no sign-in link and cannot ask for one; nothing is queued for sign-up itself', async () => {
    assert.equal((await anon.post('/api/auth/request-link', { email: 'alice@example.org' })).status, 200)
    assert.equal((await anon.post('/api/auth/request-link', { email: 'ghost@example.org' })).status, 200)
    assert.deepEqual((await outbox()).map((e) => e.template), [])
    assert.equal((await anon.post('/api/auth/use-link', { token: 'x'.repeat(40) })).status, 400)
  })
  it('request access is rate limited per email', async () => {
    let last = 200
    for (let i = 0; i < 5; i++) last = (await requestAccess(anon, 'spam@example.org', 'Spam Er')).status
    assert.equal(last, 429)
  })
})

describe('approval, outbox and personal sign-in links', () => {
  it('approving queues ONE ready-to-send email with a personal sign-in link; the link signs the organiser in', async () => {
    await approve(aliceId)
    const list = await outbox(); const mail = list.find((e) => e.template === 'organiser_approved')!
    assert.ok(mail); assert.equal(mail.to, 'alice@example.org'); assert.equal(mail.subject, 'You are approved to post on Pin Board')
    assert.match(mail.text, /^Hi Alice Org,/); assert.match(mail.text, /Your sign-in link:/); assert.ok(!/undefined|\[object/.test(mail.text)); assert.ok(!/<[a-z]+[ >]/i.test(mail.text), 'plain text, no HTML')
    const url = linkIn(mail.text)
    assert.equal((await alice.useLink(url)).status, 200)
    assert.match(alice.cookie, /^pb_session=/)
    const me = (await alice.get('/api/me')).json.user
    assert.equal(me.status, 'approved'); assert.equal(me.terms_version, '0.1')
  })
  it('the link is reusable on another device, revocable by age (newest 5 kept), and invalid tokens fail', async () => {
    const first = linkIn((await outbox()).find((e) => e.template === 'organiser_approved')!.text)
    const phone = new Client(h); assert.equal((await phone.useLink(first)).status, 200)
    for (let i = 0; i < 6; i++) await admin.post(`/api/admin/organisers/${aliceId}/link`)
    assert.equal((await new Client(h).useLink(first)).status, 400, 'oldest link was pruned')
    const fresh = (await admin.post(`/api/admin/organisers/${aliceId}/link`)).json.url; assert.equal((await new Client(h).useLink(fresh)).status, 200)
    assert.equal((await new Client(h).post('/api/auth/use-link', {})).status, 400)
  })
  it('"lost your link": approved organisers get a new one in the outbox, others and unknown emails get nothing', async () => {
    const before = (await outbox()).length
    await anon.post('/api/auth/request-link', { email: 'ghost@example.org' })
    assert.equal((await outbox()).length, before)
    assert.equal((await anon.post('/api/auth/request-link', { email: 'alice@example.org' })).status, 200)
    const m = (await outbox()).find((e) => e.template === 'login_link')!
    assert.ok(m); assert.equal(m.to, 'alice@example.org'); assert.match(m.text, /Your sign-in link:\nhttp/)
    assert.equal((await new Client(h).useLink(linkIn(m.text))).status, 200)
    let last = 200; for (let i = 0; i < 4; i++) last = (await anon.post('/api/auth/request-link', { email: 'alice@example.org' })).status
    assert.equal(last, 429)
  })
  it('"my sign-in link" gives a signed-in user a fresh link for other devices', async () => {
    const r = await alice.post('/api/me/link'); assert.equal(r.status, 200)
    assert.equal((await new Client(h).useLink(r.json.url)).status, 200)
    assert.equal((await anon.post('/api/me/link')).status, 401)
  })
  it('logout ends the session', async () => {
    const t = new Client(h); await t.useLink((await alice.post('/api/me/link')).json.url)
    assert.equal((await t.get('/api/me')).json.user.email, 'alice@example.org')
    const saved = t.cookie; await t.post('/api/auth/logout')
    assert.equal((await t.get('/api/me')).json.user, null)
    t.cookie = saved; assert.equal((await t.get('/api/me')).json.user, null)
  })
  it('anonymous: protected endpoints answer 401; organisers cannot use admin endpoints or the outbox', async () => {
    for (const p of ['/api/my/posters', '/api/admin/stats', '/api/settings', '/api/admin/outbox']) assert.equal((await anon.get(p)).status, 401, p)
    assert.equal((await alice.get('/api/admin/stats')).status, 403)
    assert.equal((await alice.get('/api/admin/outbox')).status, 403)
    assert.equal((await alice.post(`/api/admin/organisers/${aliceId}/status`, { status: 'approved' })).status, 403)
    assert.equal((await alice.post(`/api/admin/organisers/${aliceId}/link`)).status, 403)
  })
  it('a pending organiser cannot post', async () => {
    await requestAccess(anon, 'bob@example.org', 'Bob Org'); bobId = await orgId('bob@example.org')
    const t = new Client(h); await t.useLink((await admin.post(`/api/admin/organisers/${bobId}/link`)).json.url)   // admin can hand out a link even before approval
    assert.equal((await upload(t, 'Too early')).status, 403)
    await approve(bobId); await bob.useLink((await admin.post(`/api/admin/organisers/${bobId}/link`)).json.url)
  })
})

describe('outbox (emails sent by hand)', () => {
  it('lists ready-to-send emails with To, Subject and plain-text body; counts match the dashboard', async () => {
    const q = await outbox(); assert.ok(q.length >= 3)
    for (const e of q) { assert.ok(e.to.includes('@')); assert.ok(e.subject.length > 3); assert.match(e.text, /Warm regards,\nPin Board/); assert.ok(!/undefined|\[object/.test(e.subject + e.text)) }
    assert.equal((await admin.get('/api/admin/stats')).json.outbox, q.length)
  })
  it('mark as sent / skipped / back to queued', async () => {
    const e = (await outbox())[0]
    assert.equal((await admin.post(`/api/admin/outbox/${e.id}`, { status: 'sent' })).status, 200)
    assert.ok(!(await outbox()).some((x) => x.id === e.id)); assert.ok((await outbox('sent')).some((x) => x.id === e.id))
    assert.equal((await admin.post(`/api/admin/outbox/${e.id}`, { status: 'queued' })).status, 200)
    assert.ok((await outbox()).some((x) => x.id === e.id))
    assert.equal((await admin.post(`/api/admin/outbox/${e.id}`, { status: 'skipped' })).status, 200); assert.ok((await outbox('skipped')).some((x) => x.id === e.id))
    assert.equal((await admin.post(`/api/admin/outbox/${e.id}`, { status: 'nonsense' })).status, 400)
    assert.equal((await alice.post(`/api/admin/outbox/${e.id}`, { status: 'sent' })).status, 403)
  })
})

describe('posters, images, queue', () => {
  let p1 = ''
  it('rejects non-WebP and oversized uploads (checked by content and size on the server)', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...new Array(200).fill(7)])
    let r = await alice.req('POST', '/api/my/posters', undefined, { form: posterForm({ title: 'Fake image', event_date: futureDate(4) }, png, png) })
    assert.equal(r.status, 400); assert.match(r.json.error, /prepared by the upload form/)
    r = await alice.req('POST', '/api/my/posters', undefined, { form: posterForm({ title: 'Big image', event_date: futureDate(4) }, webp(800_000), webp(2000)) })
    assert.equal(r.status, 400); assert.match(r.json.error, /too large/)
    assert.equal((await alice.get('/api/my/posters')).json.length, 0)
  })
  it('a valid poster (no booking link) goes live at once, appears on the public board with its image, and creates no email', async () => {
    const before = (await outbox()).length
    const r = await upload(alice, 'Quiet Reading Evening', 5)
    assert.equal(r.status, 200, r.text); assert.equal(r.json.status, 'live'); p1 = r.json.id
    assert.equal((await outbox()).length, before, 'the organiser sees "live" on screen; no email is needed')
    const board = (await anon.get('/api/posters')).json
    assert.equal(board.length, 1); assert.equal(board[0].title, 'Quiet Reading Evening'); assert.equal(board[0].booking_url, null)
    assert.match(board[0].event_date, /^\d{4}-\d{2}-\d{2}$/)
    const img = await anon.get(board[0].image_url)
    assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/webp'); assert.match(img.headers.get('cache-control')!, /immutable/)
    assert.equal((await anon.get('/img/not/there.webp')).status, 404)
    assert.equal((await anon.get('/img/../etc/passwd')).status, 404)
    assert.ok(!JSON.stringify(board).includes('alice@example.org'), 'public board must not leak organiser details')
  })
  it('duplicate (same organiser, title, date) is blocked; https-only booking links; confirmation required', async () => {
    assert.equal((await upload(alice, 'Quiet Reading Evening', 5)).status, 400)
    assert.equal((await upload(alice, 'Insecure link', 5, { booking_url: 'http://example.com' })).status, 400)
    assert.equal((await upload(alice, 'Not confirmed', 5, { confirmed: false })).status, 400)
    assert.equal((await upload(alice, 'With link', 6, { booking_url: 'https://example.com/tickets' })).status, 200)
    assert.equal((await anon.get('/api/posters')).json.find((x: any) => x.title === 'With link').booking_url, 'https://example.com/tickets')
  })
  it('the cap logic via the API (limit lowered to 3): queue, position, promotion on take-down, promoted email in the outbox', async () => {
    const s = (await admin.get('/api/settings')).json
    assert.equal((await admin.req('PUT', '/api/admin/settings', { ...s, board_limit: 3 })).status, 200)
    assert.equal((await upload(bob, 'Third poster', 7)).json.status, 'live')
    const r4 = await upload(bob, 'Fourth poster', 8); assert.equal(r4.json.status, 'waiting'); assert.equal(r4.json.queue_position, 1)
    assert.equal((await upload(bob, 'Fifth poster', 9)).json.queue_position, 2)
    assert.equal((await anon.get('/api/posters')).json.length, 3)
    assert.equal((await bob.get('/api/my/posters')).json.find((x: any) => x.title === 'Fourth poster').queue_position, 1)
    assert.equal((await admin.post(`/api/admin/posters/${p1}/action`, { action: 'take_down', arg: 'test' })).status, 200)
    const after = (await bob.get('/api/my/posters')).json
    assert.equal(after.find((x: any) => x.title === 'Fourth poster').status, 'live')
    assert.equal(after.find((x: any) => x.title === 'Fifth poster').queue_position, 1)
    const m = (await outbox()).find((e) => e.template === 'poster_promoted')!
    assert.equal(m.to, 'bob@example.org'); assert.match(m.text, /^Hi Bob Org,/); assert.match(m.text, /"Fourth poster"/); assert.match(m.text, /\/p\/[0-9a-f-]{36}/)
    await admin.req('PUT', '/api/admin/settings', { ...(await admin.get('/api/settings')).json, board_limit: 100 })
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
  it('views and booking clicks are counted anonymously; reports reach the admin console', async () => {
    const id = (await anon.get('/api/posters')).json[0].id
    await anon.post(`/api/posters/${id}/view`); await anon.post(`/api/posters/${id}/click`)
    const row = (await admin.get('/api/admin/posters')).json.find((x: any) => x.id === id)
    assert.equal(row.views, 1); assert.equal(row.clicks, 1)
    assert.equal((await anon.post(`/api/posters/${id}/report`, { reason: 'looks like a rally' })).status, 200)
    assert.equal((await admin.get('/api/admin/reports')).json[0].reason, 'looks like a rally')
    assert.equal((await anon.post(`/api/posters/${id}/report`, { reason: '' })).status, 400)
  })
  it('expired posters never appear, even if no job has run; the nightly job archives them and queues reminders', async () => {
    await h.db.tx([{ text: "insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, area, category, status, image_path, thumb_path, width, height, confirmed_at) select id, 'a', 'alice@example.org', 'Yesterday event', ist_today() - 1, 'Adyar', 'Arts', 'live', 'x/y.webp', 'x/y-t.webp', 600, 800, now() from users where email = 'alice@example.org'" }])
    assert.ok(!(await anon.get('/api/posters')).json.some((x: any) => x.title === 'Yesterday event'))
    await h.db.tx([{ text: "update posters set event_date = ist_today() + 1 where title = 'With link'" }])
    assert.ok((await nightly(h.deps)).retention)
    assert.equal((await admin.get('/api/admin/posters')).json.find((x: any) => x.title === 'Yesterday event').status, 'expired')
    const rem = (await outbox()).find((e) => e.template === 'event_reminder')!
    assert.ok(rem); assert.equal(rem.to, 'alice@example.org'); assert.match(rem.subject, /^Reminder: With link is on /); assert.match(rem.text, /^Hi Alice Org,/)
    await nightly(h.deps); assert.equal((await outbox()).filter((e) => e.template === 'event_reminder').length, 1, 'one reminder per poster')
  })
  it('new Terms version blocks uploads until the organiser accepts it', async () => {
    const s = (await admin.get('/api/settings')).json
    await admin.req('PUT', '/api/admin/settings', { ...s, terms_version: '0.2' })
    const r = await upload(alice, 'After terms change', 10); assert.equal(r.status, 400); assert.match(r.json.error, /Terms/)
    assert.equal((await alice.post('/api/me/accept-terms', { version: '0.1' })).status, 400)
    assert.equal((await alice.post('/api/me/accept-terms', { version: '0.2' })).status, 200)
    assert.equal((await upload(alice, 'After terms change', 10)).status, 200)
    await admin.req('PUT', '/api/admin/settings', { ...s, terms_version: '0.1' }); await alice.post('/api/me/accept-terms', { version: '0.1' })
  })
  it('out of scope, rejection and suspension each produce the right email content', async () => {
    const target = (await alice.get('/api/my/posters')).json.find((x: any) => x.title === 'After terms change')
    await admin.post(`/api/admin/posters/${target.id}/action`, { action: 'out_of_scope', arg: 'A political rally' })
    const oos = (await outbox()).find((e) => e.template === 'poster_out_of_scope')!
    assert.equal(oos.to, 'alice@example.org'); assert.match(oos.text, /Reason: A political rally/); assert.match(oos.text, /Terms section 3\.1/)
    await admin.post(`/api/admin/organisers/${bobId}/status`, { status: 'suspended', reason: 'spam' })
    const sus = (await outbox()).find((e) => e.template === 'organiser_suspended')!; assert.match(sus.text, /Reason: spam/)
    assert.equal((await upload(bob, 'Suspended post', 12)).status, 403)
    assert.ok(!(await anon.get('/api/posters')).json.some((x: any) => x.title.startsWith('Third') || x.title === 'Fourth poster'))
    await requestAccess(anon, 'carol@example.org', 'Carol'); const carol = await orgId('carol@example.org')
    await admin.post(`/api/admin/organisers/${carol}/status`, { status: 'rejected', reason: 'Not a Chennai group' })
    const rej = (await outbox()).find((e) => e.template === 'organiser_rejected')!; assert.equal(rej.to, 'carol@example.org'); assert.match(rej.text, /Reason: Not a Chennai group/)
    assert.equal((await new Client(h).useLink((await admin.post(`/api/admin/organisers/${carol}/link`)).json.url)).status, 200, 'a link exists but a rejected organiser still cannot post')
    await approve(bobId)
    assert.ok((await outbox()).some((e) => e.template === 'organiser_approved' && e.to === 'bob@example.org'), 'reinstating sends a fresh link')
  })
})

describe('temporary address', () => {
  it('pages served from *.workers.dev carry noindex; other hosts do not', async () => {
    const assets = { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) }
    const t = makeHarness(process.env.TEST_DATABASE_URL!, { assets })
    assert.equal((await t.app.request('https://pinboard.example.workers.dev/organiser')).headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal((await t.app.request('https://pinboard.tcqindia.com/organiser')).headers.get('x-robots-tag'), null)
    await (t.db as any).end()
  })
  it('sign-in links use the configured public address', async () => {
    const t = makeHarness(process.env.TEST_DATABASE_URL!, { siteUrl: 'https://pinboard.tcqindia.com' })
    const { createAccessLink } = await import('../src/auth.ts')
    assert.match(await createAccessLink(t.deps, aliceId), /^https:\/\/pinboard\.tcqindia\.com\/organiser\?link=/)
    await (t.db as any).end()
  })
})
void ORIGIN
