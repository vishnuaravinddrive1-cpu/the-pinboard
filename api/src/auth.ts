import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { asOwner, q } from './db.ts'
import { EMAIL_RE, randomToken, safeEqual, sha256, sixDigits } from './util.ts'
import type { Deps, User } from './types.ts'

export const SESSION_COOKIE = 'pb_session'
const SESSION_DAYS = 30
const CODE_MINUTES = 10
const MAX_ATTEMPTS = 5

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
    q("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3::int))", await sha256(token), userId, SESSION_DAYS),
    q("delete from sessions where expires_at < now()"))
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400, secure: new URL(c.req.url).protocol === 'https:',
  })
}

export async function endSession(d: Deps, c: Context) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await asOwner(d.db, q('delete from sessions where token_hash = $1', await sha256(token)))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

const codeHash = (email: string, code: string) => sha256(`${email}:${code}`)

/** Sends a 6-digit code. Never reveals whether an email has an account. */
export async function requestCode(d: Deps, body: any): Promise<{ ok: true } | { error: string; status: number }> {
  const email = String(body?.email ?? '').trim().toLowerCase()
  const mode = body?.mode === 'signup' ? 'signup' : 'login'
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Please enter a valid email address.', status: 400 }
  const name = String(body?.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const terms = body?.terms_version ? String(body.terms_version).slice(0, 40) : null

  const [lim] = await asOwner(d.db,
    q("select bump('code:' || $1, 8, 3600) as per_email, bump('code:all', 40, 3600) as overall", await sha256(email)))
  if (!lim[0].per_email) return { error: 'Too many codes requested for this email. Please wait a while and try again.', status: 429 }
  if (!lim[0].overall) return { error: 'We are sending a lot of codes right now. Please try again in a little while.', status: 429 }

  const [ex] = await asOwner(d.db, q('select id from users where email = $1', email))
  const exists = ex.length > 0
  if (!exists && mode === 'login') return { ok: true }           // same answer as success; nothing is sent
  if (!exists) {
    const [cur] = await asOwner(d.db, q('select terms_version from settings where id = 1'))
    if (name.length < 2) return { error: 'Please enter your name or your group\'s name.', status: 400 }
    if (terms !== cur[0].terms_version) return { error: 'Please accept the Terms and Conditions to sign up.', status: 400 }
  }
  const code = sixDigits()
  await asOwner(d.db,
    q("update login_codes set used = true where email = $1 and not used", email),
    q("insert into login_codes (email, code_hash, name, terms_version, expires_at) values ($1, $2, $3, $4, now() + make_interval(mins => $5::int))",
      email, await codeHash(email, code), exists ? null : name, exists ? null : terms, CODE_MINUTES),
    q("select enqueue_email($1, 'login_code', jsonb_build_object('code', $2::text, 'signup', $3::boolean))", email, code, !exists))
  return { ok: true }
}

/** Checks the code; creates the account on first sign-up; returns the user id. */
export async function verifyCode(d: Deps, body: any): Promise<{ userId: string } | { error: string; status: number }> {
  const email = String(body?.email ?? '').trim().toLowerCase()
  const code = String(body?.code ?? '').replace(/\s/g, '')
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code from the email.', status: 400 }
  const [rows] = await asOwner(d.db, q(
    'select id, code_hash, name, terms_version, attempts from login_codes where email = $1 and not used and expires_at > now() order by created_at desc limit 1', email))
  const row = rows[0]
  if (!row || row.attempts >= MAX_ATTEMPTS) return { error: 'That code has expired. Please ask for a new one.', status: 400 }
  if (!safeEqual(row.code_hash, await codeHash(email, code))) {
    await asOwner(d.db, q('update login_codes set attempts = attempts + 1 where id = $1', row.id))
    return { error: 'That code is not right. Please check and try again.', status: 400 }
  }
  const res = await asOwner(d.db,
    q('update login_codes set used = true where id = $1', row.id),
    q('select register_user($1, $2, $3, $4) as id', email, row.name, row.terms_version, d.cfg.bootstrapAdmin ?? null))
  return { userId: res[1][0].id as string }
}
