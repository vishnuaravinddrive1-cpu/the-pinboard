// Local full-stack server for browser tests: the built website + the API on a local Postgres.
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
const setupKey = 'e2e-setup-key-0123456789-abcdefghijklmnop'
const h = makeHarness(process.env.DATABASE_URL!, {
  siteUrl: `http://127.0.0.1:${port}`, setupKey, bootstrapAdmin: process.env.BOOTSTRAP_ADMIN_EMAIL, assets,
  extend: (app) => {
    // Test-only: make sure an account exists (optionally approved) and return its personal sign-in link, like the admin's email would.
    app.get('/__test/link', async (c) => {
      const email = (c.req.query('email') ?? '').toLowerCase(), name = c.req.query('name') ?? email.split('@')[0]
      const [[u]] = await h.db.tx([{ text: 'select register_user($1, $2, $3, null) as id', params: [email, name, '0.1'] }])
      if (c.req.query('approve') === '1') await h.db.tx([{ text: "update profiles set status = 'approved' where id = $1 and role = 'organiser'", params: [u.id] }])
      const { createAccessLink } = await import('../src/auth.ts')
      return c.json({ url: await createAccessLink(h.deps, u.id) })
    })
    app.get('/__test/setup-key', (c) => c.json({ key: setupKey }))
  },
})
serve({ fetch: h.app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`pinboard test server on http://127.0.0.1:${port}`))
