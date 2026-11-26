const enc = new TextEncoder()
export const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
export async function sha256(s: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))) }
export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes)); let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function sixDigits(): string {
  // rejection sampling: no modulo bias
  for (;;) { const n = crypto.getRandomValues(new Uint32Array(1))[0]; if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, '0') }
}
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
export const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,255}\.[^\s@<>"']{2,}$/
export const cleanName = (s: unknown, max = 80) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
export const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
export const istDate = (d = new Date()) => fmt.format(d)
