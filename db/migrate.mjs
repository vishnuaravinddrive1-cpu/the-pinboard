// Applies db/migrations/*.sql in order and remembers which ones ran. Usage: DATABASE_URL=postgres://... node db/migrate.mjs
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'package.json'))
const pg = require('pg')
const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL first (the Neon connection string).'); process.exit(1) }
const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1|\/tmp|host=\// .test(url) ? false : { rejectUnauthorized: true } })
await client.connect()
await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())')
const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name))
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
  if (done.has(f)) { console.log('skip   ', f); continue }
  console.log('apply  ', f)
  try {
    await client.query('begin'); await client.query(await readFile(join(dir, f), 'utf8'))
    await client.query('insert into schema_migrations (name) values ($1)', [f]); await client.query('commit')
  } catch (e) { await client.query('rollback'); console.error('FAILED', f, e.message); process.exit(1) }
}
await client.end(); console.log('database is up to date')
