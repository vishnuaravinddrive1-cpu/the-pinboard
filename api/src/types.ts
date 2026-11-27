export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  delete(keys: string | string[]): Promise<void>
}
export interface Env {
  DATABASE_URL: string
  SITE_URL?: string                  // public address, e.g. https://pinboard.tcqindia.com (defaults to the request's own origin)
  BOOTSTRAP_ADMIN_EMAIL?: string     // the admin's email (set-up key, or a verified Google sign-in with this email, creates the first admin)
  ADMIN_SETUP_KEY?: string           // long random string; opens /organiser?setup=<key> while no admin exists
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
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
  setupKey?: string
  bootstrapAdmin?: string
  googleId?: string
  googleSecret?: string
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
