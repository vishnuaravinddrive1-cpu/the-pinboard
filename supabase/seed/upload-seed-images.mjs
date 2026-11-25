// Usage: SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed/upload-seed-images.mjs
// Run it on your own computer. The service-role key is used only here, never in the website.
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1) }
const dir = join(dirname(fileURLToPath(import.meta.url)), 'images')
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.webp'))) {
  const res = await fetch(`${url}/storage/v1/object/posters/seed/${f}`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'image/webp', 'x-upsert': 'true' }, body: await readFile(join(dir, f)),
  })
  console.log(f, res.ok ? 'uploaded' : `FAILED ${res.status} ${await res.text()}`)
}
