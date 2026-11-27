import { createApp } from '../src/app.ts'
import { pgDb } from './db-pg.ts'
import { DbStore } from '../src/store.ts'
import type { Deps } from '../src/types.ts'

/** An app wired to a real Postgres and an in-database image store. No email is ever sent: the app has no email sender. */
export function makeHarness(databaseUrl: string, opts: { siteUrl?: string; setupKey?: string; bootstrapAdmin?: string; assets?: Deps['assets']; extend?: Parameters<typeof createApp>[1] } = {}) {
  const db = pgDb(databaseUrl)
  const pending = new Set<Promise<unknown>>()
  const deps: Deps = {
    db, store: new DbStore(db),
    cfg: { siteUrl: opts.siteUrl ?? 'http://localhost', setupKey: opts.setupKey, bootstrapAdmin: opts.bootstrapAdmin },
    fetchFn: (async (url: any) => { throw new Error('unexpected outbound request ' + url) }) as typeof fetch,
    defer: (p) => { const t = p.finally(() => pending.delete(t)); pending.add(t) },
    assets: opts.assets,
  }
  const app = createApp(deps, opts.extend)
  return { app, deps, db, flush: async () => { while (pending.size) await Promise.all([...pending]) } }
}
