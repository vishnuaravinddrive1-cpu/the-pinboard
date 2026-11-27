import { asOwner, q } from './db.ts'
import type { Deps } from './types.ts'

/** 00:00 IST: archive expired posters, promote the queue, queue reminder emails (into the admin's outbox), then housekeeping. */
export async function nightly(d: Deps) {
  await asOwner(d.db, q('select nightly_job()'), q('delete from access_links where expires_at < now() - interval \'30 days\''), q('delete from sessions where expires_at < now()'))
  const retention = await runRetention(d)
  return { retention }
}

/** Delete image files of posters past the retention period, anonymise those records, and empty the purge queue. */
export async function runRetention(d: Deps) {
  const [purge] = await asOwner(d.db, q('select path from purge_queue limit 200'))
  if (purge.length) {
    await d.store.delete(purge.map((r) => r.path as string).filter(Boolean))
    await asOwner(d.db, q('delete from purge_queue where path = any($1::text[])', purge.map((r) => r.path)))
  }
  const [due] = await asOwner(d.db, q('select id, image_path, thumb_path from retention_due() limit 200'))
  for (const r of due) {
    await d.store.delete([r.image_path, r.thumb_path].filter(Boolean))
    await asOwner(d.db, q('select retention_mark($1::uuid)', r.id))
  }
  return { anonymised: due.length, purged: purge.length }
}
