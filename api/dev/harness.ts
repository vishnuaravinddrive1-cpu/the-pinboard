import { createApp } from '../src/app.ts'
import { pgDb } from './db-pg.ts'
import { DbStore } from '../src/store.ts'
import type { Deps } from '../src/types.ts'

export interface Mail { to: string[]; subject: string; html: string; headers: Record<string, string>; body: any }

/** An app wired to a real Postgres, an in-database image store and a fake Resend that records every email. */
export function makeHarness(databaseUrl: string, opts: { siteUrl?: string; bootstrapAdmin?: string; resendStatus?: () => number; assets?: Deps['assets']; extend?: Parameters<typeof createApp>[1] } = {}) {
  const db = pgDb(databaseUrl)
  const mails: Mail[] = []
  const pending = new Set<Promise<unknown>>()
  const deps: Deps = {
    db, store: new DbStore(db),
    cfg: { siteUrl: opts.siteUrl ?? 'http://localhost', takedownSecret: 'test-takedown-secret', resendKey: 're_test', fromEmail: 'Pin Board <pinboard@tcqindia.com>', replyTo: 'thecuriosityquotient@gmail.com', bootstrapAdmin: opts.bootstrapAdmin },
    fetchFn: (async (url: any, init: any) => {
      if (String(url).startsWith('https://api.resend.com/emails')) {
        const status = opts.resendStatus?.() ?? 200
        if (status !== 200) return new Response('{"message":"simulated failure"}', { status })
        const body = JSON.parse(init.body)
        mails.push({ to: body.to, subject: body.subject, html: body.html, headers: init.headers, body })
        return new Response('{"id":"em_1"}', { status: 200 })
      }
      throw new Error('unexpected outbound request ' + url)
    }) as typeof fetch,
    defer: (p) => { const t = p.finally(() => pending.delete(t)); pending.add(t) },
    assets: opts.assets,
  }
  const app = createApp(deps, opts.extend)
  return { app, deps, db, mails, flush: async () => { while (pending.size) await Promise.all([...pending]) } }
}
