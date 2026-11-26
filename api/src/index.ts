// Cloudflare Worker entry: serves the API, images and the website (static assets), plus scheduled jobs.
import { createApp } from './app.ts'
import { nightly } from './cron.ts'
import { drainEmails } from './email.ts'
import { neonDb } from './db-neon.ts'
import { DbStore, LayeredStore, R2Store } from './store.ts'
import type { Deps, Env } from './types.ts'

interface Ctx { waitUntil(p: Promise<unknown>): void }

function makeDeps(env: Env, ctx: Ctx, origin?: string): Deps {
  const db = neonDb(env.DATABASE_URL)
  const dbStore = new DbStore(db)
  return {
    db,
    store: env.IMAGES ? new LayeredStore(new R2Store(env.IMAGES), dbStore) : dbStore,
    cfg: {
      siteUrl: (env.SITE_URL || origin || '').replace(/\/$/, ''), takedownSecret: env.TAKEDOWN_SECRET, resendKey: env.RESEND_API_KEY,
      fromEmail: env.FROM_EMAIL ?? 'Pin Board <pinboard@tcqindia.com>', replyTo: env.REPLY_TO ?? 'thecuriosityquotient@gmail.com',
      googleId: env.GOOGLE_CLIENT_ID, googleSecret: env.GOOGLE_CLIENT_SECRET, bootstrapAdmin: env.BOOTSTRAP_ADMIN_EMAIL,
    },
    fetchFn: fetch, defer: (p) => ctx.waitUntil(p), assets: env.ASSETS,
  }
}

export default {
  fetch(req: Request, env: Env, ctx: Ctx) { return createApp(makeDeps(env, ctx, new URL(req.url).origin)).fetch(req, env, ctx as any) },
  async scheduled(event: { cron: string }, env: Env, ctx: Ctx) {
    const d = makeDeps(env, ctx)
    // "30 18 * * *" = 00:00 IST nightly job; the hourly trigger retries failed emails.
    ctx.waitUntil(event.cron === '30 18 * * *' ? nightly(d) : drainEmails(d, 20))
  },
}
