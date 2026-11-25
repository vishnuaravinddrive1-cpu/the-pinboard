-- Storage bucket, storage RLS and the scheduled jobs. Needs the pg_cron and pg_net extensions
-- (Dashboard -> Database -> Extensions, or the two `create extension` lines below).

-- ---------------------------------------------------------------- storage
-- Safety net on the server: only small WebP images, only into your own folder, only if approved.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 716800, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = 716800, allowed_mime_types = array['image/webp'];

create policy posters_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy posters_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'posters' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- Public read works because the bucket is public.

-- ---------------------------------------------------------------- scheduled jobs
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Calls an edge function using the URL and secret saved by the README step.
create function kick_edge(fn text) returns void language plpgsql security definer set search_path = public as $$
declare c edge_config;
begin
  select * into c from edge_config where id = 1;
  if c.functions_url is null or c.cron_secret is null then return; end if;
  perform net.http_post(url := c.functions_url || '/' || fn,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', c.cron_secret),
                        body := '{}'::jsonb);
end $$;

create function set_edge_config(p_functions_url text, p_secret text) returns void language sql security definer set search_path = public as
$$ update edge_config set functions_url = regexp_replace(p_functions_url, '/+$', ''), cron_secret = p_secret where id = 1 $$;
revoke all on function kick_edge(text), set_edge_config(text, text) from public, anon, authenticated;

-- 00:00 IST = 18:30 UTC: archive expired posters, promote the queue, queue reminders.
select cron.schedule('pinboard-nightly', '30 18 * * *', $$ select public.nightly_job() $$);
-- Every minute: ask the email worker to send due emails (throttled inside the function).
select cron.schedule('pinboard-send-emails', '* * * * *', $$ select public.kick_edge('send-emails') $$);
-- Weekly (Sunday 20:00 UTC): delete image files / anonymise records past the retention period.
select cron.schedule('pinboard-retention', '0 20 * * 0', $$ select public.kick_edge('retention') $$);
