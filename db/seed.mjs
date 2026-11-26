// Loads 20 sample posters (and their images). Usage: DATABASE_URL=postgres://... node db/seed.mjs [extra]
//   extra = number of filler posters to add so you can watch the 100-poster cap and the queue (e.g. 90).
// Remove everything again with:  select seed_remove();
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pg = createRequire(join(here, '..', 'api', 'package.json'))('pg')
const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL first.'); process.exit(1) }
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1|\/tmp|host=\//.test(url) ? false : { rejectUnauthorized: true } })
await client.connect()
const imgDir = join(here, 'seed', 'images')
for (const f of (await readdir(imgDir)).filter((x) => x.endsWith('.webp'))) {
  const data = await readFile(join(imgDir, f))
  await client.query('insert into image_blobs (key, data, bytes) values ($1, $2, $3) on conflict (key) do nothing', [`seed/${f}`, data, data.length])
}
await client.query(await readFile(join(here, 'seed', 'seed.sql'), 'utf8'))
const extra = Number(process.argv[2] ?? 0)
if (extra > 0) await client.query('select seed_filler($1)', [extra])
const r = await client.query("select count(*) filter (where status='live') live, count(*) filter (where status='waiting') waiting from posters")
console.log('seeded:', r.rows[0])
await client.end()
