import { asOwner, q } from './db.ts'
import type { Db, ImageStore, R2BucketLike } from './types.ts'

const toB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Default: images in the Neon database (no extra account needed). */
export class DbStore implements ImageStore {
  constructor(private db: Db) {}
  async put(key: string, bytes: Uint8Array) {
    await asOwner(this.db, q("insert into image_blobs (key, data, bytes) values ($1, decode($2, 'base64'), $3) on conflict (key) do update set data = excluded.data, bytes = excluded.bytes", key, toB64(bytes), bytes.length))
  }
  async get(key: string) {
    const [rows] = await asOwner(this.db, q("select encode(data, 'base64') as b64 from image_blobs where key = $1", key))
    return rows[0] ? fromB64(rows[0].b64) : null
  }
  async delete(keys: string[]) { if (keys.length) await asOwner(this.db, q('delete from image_blobs where key = any($1::text[])', keys)) }
}

export class R2Store implements ImageStore {
  constructor(private bucket: R2BucketLike) {}
  async put(key: string, bytes: Uint8Array) { await this.bucket.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } }) }
  async get(key: string) { const o = await this.bucket.get(key); return o ? new Uint8Array(await o.arrayBuffer()) : null }
  async delete(keys: string[]) { if (keys.length) await this.bucket.delete(keys) }
}

/** New images go to `primary`; reads fall back to `fallback` (e.g. seed images or images saved before R2 was switched on). */
export class LayeredStore implements ImageStore {
  constructor(private primary: ImageStore, private fallback: ImageStore) {}
  put(key: string, bytes: Uint8Array) { return this.primary.put(key, bytes) }
  async get(key: string) { return (await this.primary.get(key)) ?? (await this.fallback.get(key)) }
  async delete(keys: string[]) { await Promise.all([this.primary.delete(keys), this.fallback.delete(keys)]) }
}

export class MemoryStore implements ImageStore {
  files = new Map<string, Uint8Array>()
  async put(key: string, bytes: Uint8Array) { this.files.set(key, bytes) }
  async get(key: string) { return this.files.get(key) ?? null }
  async delete(keys: string[]) { for (const k of keys) this.files.delete(k) }
}

/** WebP files start with "RIFF" <size> "WEBP". Checked by content, never by file name or declared type. */
export function isWebp(b: Uint8Array): boolean {
  const s = (a: number, n: number) => String.fromCharCode(...b.subarray(a, a + n))
  return b.length > 32 && s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP'
}
export const MAX_IMAGE_BYTES = 716_800
