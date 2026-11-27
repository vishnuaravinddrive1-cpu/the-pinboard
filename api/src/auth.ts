import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { asOwner, q } from './db.ts'
import { EMAIL_RE, randomToken, safeEqual, sha256 } from './util.ts'
import type { Deps, User } from './types.ts'

export const SESSION_COOKIE = 'pb_session'
const SESSION_DAYS = 30
const LINK_DAYS = 365
const MAX_LINKS = 5

export async function currentUser(d: Deps, c: Context): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token || token.length < 20) return null
  const [rows] = await asOwner(d.db, q(
    `select p.id, p.email, p.display_name, p.role, p.status, p.terms_version
       from sessions s join profiles p on p.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`, await sha256(token)))
  return (rows[0] as User) ?? null
}

export async function startSession(d: Deps, c: Context, userId: string) {
  const token = randomToken(32)
  await asOwner(d.db,
    q('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3::int))', await sha256(token), userId, SESSION_DAYS),
    q('delete from sessions where expires_at < now()'))
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400, secure: new URL(c.req.url).protocol === 'https:',
  })
}

export async function endSession(d: Deps, c: Context) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await asOwner(d.db, q('delete from sessions where token_hash = $1', await sha256(token)))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** A personal sign-in link: reusable on any device for a year, revocable. Only its hash is stored. Keeps the newest few. */
export async function createAccessLink(d: Deps, userId: string): Promise<string> {
  const token = randomToken(32)
  await asOwner(d.db,
    q("insert into access_links (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3::int))", await sha256(token), userId, LINK_DAYS),
    q(`delete from access_links where user_id = $1 and token_hash not in
         (select token_hash from access_links where user_id = $1 order by created_at desc limit $2)`, userId, MAX_LINKS))
  return `${d.cfg.siteUrl}/organiser?link=${token}`
}

type Fail = { error: string; status: number }
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** "Request access": creates a PENDING account. No login happens here; the admin approves and emails the sign-in link. */
export async function signup(d: Deps, body: any): Promise<{ ok: true } | Fail> {
  const email = String(body?.email ?? '').trim().toLowerCase()
  const name = clean(body?.name, 80), terms = body?.terms_version ? String(body.terms_version).slice(0, 40) : null
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Please enter a valid email address.', status: 400 }
  if (name.length < 2) return { error: "Please enter your name or your group's name.", status: 400 }
  const [cur] = await asOwner(d.db, q('select terms_version from settings where id = 1'))
  if (terms !== cur[0].terms_version) return { error: 'Please accept the Terms and Conditions to request access.', status: 400 }
  const [lim] = await asOwner(d.db, q("select bump('signup:' || $1, 3, 3600) as per_email, bump('signup:all', 40, 3600) as overall", await sha256(email)))
  if (!lim[0].per_email || !lim[0].overall) return { error: 'Too many requests right now. Please try again in a little while.', status: 429 }
  // Same answer whether or not the email already has an account. The email is NOT verified here: only the person who
  // receives the admin's approval email can use the sign-in link, and nobody gets in before approval.
  await asOwner(d.db, q('select register_user($1, $2, $3, null)', email, name, terms))
  return { ok: true }
}

/** "Lost your link?": for existing, approved accounts, queue a fresh link in the admin's outbox. Never reveals whether the email exists. */
export async function requestLink(d: Deps, body: any): Promise<{ ok: true } | Fail> {
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Please enter a valid email address.', status: 400 }
  const [lim] = await asOwner(d.db, q("select bump('link:' || $1, 3, 3600) as per_email, bump('link:all', 30, 3600) as overall", await sha256(email)))
  if (!lim[0].per_email || !lim[0].overall) return { error: 'Too many requests right now. Please try again in a little while.', status: 429 }
  const [rows] = await asOwner(d.db, q("select id, display_name from profiles where email = $1 and status = 'approved'", email))
  if (rows[0]) {
    const url = await createAccessLink(d, rows[0].id)
    await asOwner(d.db, q("select enqueue_email($1, 'login_link', jsonb_build_object('name', $2::text, 'signin_url', $3::text))", email, rows[0].display_name, url))
  }
  return { ok: true }
}

export async function useLink(d: Deps, token: unknown): Promise<{ userId: string } | Fail> {
  const t = String(token ?? '')
  if (t.length < 20 || t.length > 200) return { error: 'That sign-in link is not valid.', status: 400 }
  const [rows] = await asOwner(d.db, q(
    `select l.user_id from access_links l where l.token_hash = $1 and not l.revoked and l.expires_at > now()`, await sha256(t)))
  if (!rows[0]) return { error: 'That sign-in link is not valid or has expired. Ask for a new one.', status: 400 }
  return { userId: rows[0].user_id as string }
}

/** First-time admin set-up with the secret ADMIN_SETUP_KEY. Works only while there is no admin. */
export async function setup(d: Deps, key: unknown): Promise<{ userId: string; link: string } | Fail> {
  if (!d.cfg.setupKey || !d.cfg.bootstrapAdmin) return { error: 'Admin set-up is not switched on.', status: 404 }
  const [lim] = await asOwner(d.db, q("select bump('setup', 5, 3600) as ok"))
  if (!lim[0].ok) return { error: 'Too many attempts. Please try again later.', status: 429 }
  if (!safeEqual(String(key ?? ''), d.cfg.setupKey)) return { error: 'That set-up key is not right.', status: 403 }
  const [rows] = await asOwner(d.db, q("select bootstrap_admin($1, 'Admin') as id", d.cfg.bootstrapAdmin))
  const userId = rows[0].id as string
  return { userId, link: await createAccessLink(d, userId) }
}
