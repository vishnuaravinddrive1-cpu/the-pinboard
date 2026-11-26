export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  delete(keys: string | string[]): Promise<void>
}
export interface Env {
  DATABASE_URL: string
  SITE_URL?: string                  // public address, e.g. https://pinboard.tcqindia.com (defaults to the request's own origin)
  TAKEDOWN_SECRET: string
  RESEND_API_KEY?: string
  FROM_EMAIL?: string
  REPLY_TO?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  BOOTSTRAP_ADMIN_EMAIL?: string
  IMAGES?: R2BucketLike              // optional: Cloudflare R2. Without it, images live in Neon (table image_blobs).
  ASSETS?: { fetch(req: Request): Promise<Response> }
}
export interface Stmt { text: string; params?: unknown[] }
/** Runs all statements in ONE transaction and returns each statement's rows. */
export interface Db { tx(stmts: Stmt[]): Promise<Record<string, any>[][]> }
export interface ImageStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  delete(keys: string[]): Promise<void>
}
export interface Config {
  siteUrl: string
  takedownSecret: string
  resendKey?: string
  fromEmail: string
  replyTo: string
  googleId?: string
  googleSecret?: string
  bootstrapAdmin?: string
}
export interface Deps {
  db: Db
  store: ImageStore
  cfg: Config
  fetchFn: typeof fetch
  /** Run something after the response is sent (ctx.waitUntil on Workers). */
  defer(p: Promise<unknown>): void
  assets?: Env['ASSETS']
}
export interface User {
  id: string
  email: string
  display_name: string
  role: 'organiser' | 'admin'
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  terms_version: string | null
}
