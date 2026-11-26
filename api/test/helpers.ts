import { makeHarness } from '../dev/harness.ts'

export const ORIGIN = 'http://localhost'
export function webp(size = 2000): Uint8Array {
  const b = new Uint8Array(size); b.set([0x52, 0x49, 0x46, 0x46]); b.set([0x57, 0x45, 0x42, 0x50], 8); for (let i = 12; i < size; i++) b[i] = i & 255; return b
}
export type H = ReturnType<typeof makeHarness>

/** A browser-like client: keeps the session cookie, sends the Origin header like a browser would. */
export class Client {
  cookie = ''
  constructor(public h: H) {}
  async req(method: string, path: string, body?: unknown, opts: { origin?: string | null; form?: FormData } = {}) {
    const headers: Record<string, string> = {}
    if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN
    if (this.cookie) headers.cookie = this.cookie
    let payload: BodyInit | undefined
    if (opts.form) payload = opts.form
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await this.h.app.request(ORIGIN + path, { method, headers, body: payload })
    const sc = res.headers.getSetCookie?.() ?? []
    for (const c of sc) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === '') this.cookie = ''; else this.cookie = `${k}=${v}` }
    const text = await res.text()
    let json: any = null; try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers }
  }
  get(p: string) { return this.req('GET', p) }
  post(p: string, b?: unknown) { return this.req('POST', p, b ?? {}) }
  async login(email: string, name = 'Test User', terms = '0.1') {
    await this.post('/api/auth/request-code', { email, mode: 'signup', name, terms_version: terms })
    const code = await lastCode(this.h, email)
    return this.post('/api/auth/verify', { email, code })
  }
}
export async function lastCode(h: H, email: string): Promise<string> {
  await h.flush(); await drain(h)
  const m = [...h.mails].reverse().find((x) => x.to[0] === email && /^Your Pin Board code: \d{6}$/.test(x.subject))
  if (!m) throw new Error('no code email for ' + email)
  return m.subject.slice(-6)
}
import { drainEmails } from '../src/email.ts'
export const drain = async (h: H) => { await h.flush(); return drainEmails(h.deps, 50) }
export function posterForm(meta: Record<string, unknown>, full = webp(3000), thumb = webp(1500)) {
  const f = new FormData()
  f.set('meta', JSON.stringify({ area: 'Adyar', category: 'Arts', confirmed: true, width: 600, height: 800, ...meta }))
  f.set('full', new Blob([full as BlobPart], { type: 'image/webp' }), 'full.webp'); f.set('thumb', new Blob([thumb as BlobPart], { type: 'image/webp' }), 'thumb.webp')
  return f
}
export const futureDate = (n: number) => new Date(Date.now() + (n + 0.25) * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10)
