// Weekly: delete image files for posters past the retention period, anonymise those records, empty the purge queue.
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // files orphaned by admin deletes / image replacements
  const { data: purge } = await sb.from('purge_queue').select('path').limit(500)
  if (purge?.length) {
    const { error } = await sb.storage.from('posters').remove(purge.map((r) => r.path).filter(Boolean))
    if (!error) await sb.from('purge_queue').delete().in('path', purge.map((r) => r.path))
  }
  const { data: due } = await sb.rpc('retention_due')
  let done = 0
  for (const r of due ?? []) {
    const paths = [r.image_path, r.thumb_path].filter(Boolean)
    if (paths.length) { const { error } = await sb.storage.from('posters').remove(paths); if (error) continue }
    await sb.rpc('retention_mark', { p_id: r.id }); done++
  }
  return Response.json({ anonymised: done, purged: purge?.length ?? 0 })
})
