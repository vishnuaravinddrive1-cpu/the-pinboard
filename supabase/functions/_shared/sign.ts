// HMAC-signed take-down links, so the admin email can act without a login.
const enc = new TextEncoder()
async function key(secret: string) { return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) }
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
export async function sign(secret: string, id: string): Promise<string> { return hex(await crypto.subtle.sign('HMAC', await key(secret), enc.encode('takedown:' + id))) }
export async function verify(secret: string, id: string, token: string): Promise<boolean> {
  const good = await sign(secret, id)
  if (good.length !== token.length) return false
  let d = 0; for (let i = 0; i < good.length; i++) d |= good.charCodeAt(i) ^ token.charCodeAt(i)
  return d === 0
}
