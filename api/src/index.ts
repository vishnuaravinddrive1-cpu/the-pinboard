// Cloudflare Worker entry: serves the API, images and the website (static assets), plus scheduled jobs.
import { createApp } from './app.ts'
import { nightly } from './cron.ts'
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
      siteUrl: (env.SITE_URL || origin || '').replace(/\/$/, ''), setupKey: env.ADMIN_SETUP_KEY, bootstrapAdmin: env.BOOTSTRAP_ADMIN_EMAIL,
      googleId: env.GOOGLE_CLIENT_ID, googleSecret: env.GOOGLE_CLIENT_SECRET,
    },
    fetchFn: fetch, defer: (p) => ctx.waitUntil(p), assets: env.ASSETS,
  }
}

export default {
  fetch(req: Request, env: Env, ctx: Ctx) { return createApp(makeDeps(env, ctx, new URL(req.url).origin)).fetch(req, env, ctx as any) },
  async scheduled(_event: { cron: string }, env: Env, ctx: Ctx) {
    // "30 18 * * *" = 00:00 IST: archive expired posters, promote the queue, queue reminders, retention.
    ctx.waitUntil(nightly(makeDeps(env, ctx)))
  },
}
