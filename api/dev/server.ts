// Local full-stack server for browser tests: the built website + the API on a local Postgres, with a fake Resend.
import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { makeHarness } from './harness.ts'

const port = Number(process.env.PORT ?? 4180)
const dist = process.env.DIST ?? join(process.cwd(), '..', 'web', 'dist')
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mjs': 'text/javascript', '.txt': 'text/plain' }
const assets = {
  async fetch(req: Request) {
    const p = normalize(new URL(req.url).pathname).replace(/^(\.\.[/\\])+/, '')
    for (const f of [join(dist, p), join(dist, 'index.html')]) {
      try { if (p.endsWith('/') && f !== join(dist, 'index.html')) continue; const b = await readFile(f); return new Response(b, { headers: { 'Content-Type': types[extname(f)] ?? 'application/octet-stream' } }) } catch { /* try next */ }
    }
    return new Response('not found', { status: 404 })
  },
}
let flush: () => Promise<void> = async () => {}
let mailList: { to: string[]; subject: string }[] = []
const h = makeHarness(process.env.DATABASE_URL!, {
  siteUrl: `http://127.0.0.1:${port}`, bootstrapAdmin: process.env.BOOTSTRAP_ADMIN_EMAIL, assets,
  extend: (app) => {
    app.get('/__test/mails', async (c) => { await flush(); return c.json(mailList.map((m) => ({ to: m.to[0], subject: m.subject }))) })
    app.get('/__test/code', async (c) => {
      await flush()
      const m = [...mailList].reverse().find((x) => x.to[0] === c.req.query('email') && /^Your Pin Board code: \d{6}$/.test(x.subject))
      return c.json({ code: m?.subject.slice(-6) ?? null })
    })
  },
})
flush = h.flush; mailList = h.mails
serve({ fetch: h.app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`pinboard test server on http://127.0.0.1:${port}`))
