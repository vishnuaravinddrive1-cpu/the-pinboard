-- Behaviour tests: RLS, roles, cap + queue, expiry, reminders, analytics, storage rules, retention.
create schema t; grant usage on schema t to public;
create table t.ids (name text primary key, id uuid);
grant all on t.ids to public;

create function t.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from t.ids where name = p_name), true);
  execute 'set local role authenticated';
end $$;
create function t.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS  %', label; else raise exception 'FAIL  %', label; end if; end $$;
-- Runs a statement and expects it to fail (message must match pattern).
create function t.fails(stmt text, pattern text, label text) returns void language plpgsql as $$
declare msg text;
begin
  begin execute stmt; msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is null then raise exception 'FAIL  % (statement succeeded)', label;
  elsif msg !~* pattern then raise exception 'FAIL  % (got: %)', label, msg;
  else raise notice 'PASS  %', label; end if;
end $$;
grant execute on all functions in schema t to public;

-- ---------------------------------------------------------------- users
do $$
declare cur text; u uuid; n text;
begin
  select terms_version into cur from settings;
  foreach n in array array['admin', 'orgA', 'orgB', 'orgC'] loop
    insert into auth.users (email, raw_user_meta_data) values (lower(n) || '@test.dev', jsonb_build_object('display_name', n, 'terms_version', cur)) returning id into u;
    insert into t.ids values (n, u);
  end loop;
  update profiles set role = 'admin', status = 'approved' where email = 'admin@test.dev';
  perform t.ok((select count(*) from profiles) = 4, 'sign-up trigger creates a profile per user');
  perform t.ok((select count(*) from terms_acceptances) = 4, 'terms acceptance (version + timestamp) stored at sign-up');
  perform t.ok((select status from profiles where email = 'orga@test.dev') = 'pending', 'new organisers start as pending');
  perform t.ok((select count(*) from email_queue where template = 'admin_new_organiser') = 4, 'admin is emailed for each new organiser');
end $$;

-- ---------------------------------------------------------------- roles and RLS
do $$
begin
  perform t.as_user('orgA');
  perform t.fails($q$ select admin_set_organiser_status((select id from t.ids where name='orgA'), 'approved') $q$, 'admins only', 'organiser cannot approve themselves');
  update profiles set status = 'approved' where email = 'orga@test.dev';
  reset role;
  perform t.ok((select status from profiles where email = 'orga@test.dev') = 'pending', 'organiser cannot approve themselves by direct update (RLS blocks the row)');
  perform t.as_user('admin');
  perform admin_set_organiser_status((select id from t.ids where name='orgA'), 'approved');
  perform admin_set_organiser_status((select id from t.ids where name='orgB'), 'approved');
  reset role;
  perform t.ok((select count(*) from email_queue where template = 'organiser_approved') = 2, 'approval emails queued for organisers');
  perform t.ok((select count(*) from activity_log where action = 'organiser_approved') = 2, 'approvals appear in the activity log');
end $$;

do $$
begin
  perform t.as_user('orgC');   -- still pending
  perform t.fails($q$ select create_poster('Pending cant post', ist_today()+5, null, 'Adyar', null, 'Arts', true, (select id::text from t.ids where name='orgC')||'/a.webp', (select id::text from t.ids where name='orgC')||'/b.webp', 600, 800) $q$,
    'not approved', 'pending organiser cannot post');
  reset role;
  perform t.as_anon();
  perform t.fails($q$ select * from posters $q$, 'permission denied', 'anonymous cannot read the posters table');
  perform t.fails($q$ select * from profiles $q$, 'permission denied', 'anonymous cannot read profiles');
  perform t.fails($q$ select * from email_queue $q$, 'permission denied', 'anonymous cannot read the email queue');
  perform t.fails($q$ select create_poster('x y z', ist_today()+5, null, 'Adyar', null, 'Arts', true, 'a/a.webp', 'a/b.webp', 600, 800) $q$, 'permission denied', 'anonymous cannot create posters');
  reset role;
end $$;

-- ---------------------------------------------------------------- 100-cap (limit lowered to 3 for the test) and queue
create function t.mk(p_user text, p_title text, p_days int default 5, p_url text default null) returns table (id uuid, status poster_status, queue_position bigint)
language plpgsql as $$
declare uid text := (select ids.id::text from t.ids where name = p_user);
begin
  perform t.as_user(p_user);
  return query select * from create_poster(p_title, ist_today() + p_days, p_url, 'Adyar', null, 'Arts', true, uid || '/' || p_title || '.webp', uid || '/' || p_title || '-t.webp', 600, 800);
  reset role;
end $$;

do $$
declare r record; ids uuid[] := '{}';
begin
  perform t.as_user('admin'); update settings set board_limit = 3; reset role;
  for r in select * from t.mk('orgA', 'Poster 1', 1, 'https://example.com/1') loop ids := ids || r.id; perform t.ok(r.status = 'live', 'poster 1 goes live instantly'); end loop;
  for r in select * from t.mk('orgA', 'Poster 2', 2) loop ids := ids || r.id; perform t.ok(r.status = 'live', 'poster 2 goes live'); end loop;
  for r in select * from t.mk('orgB', 'Poster 3', 3) loop ids := ids || r.id; perform t.ok(r.status = 'live', 'poster 3 fills the board (limit 3)'); end loop;
  for r in select * from t.mk('orgA', 'Poster 4', 4) loop ids := ids || r.id; perform t.ok(r.status = 'waiting' and r.queue_position = 1, 'poster 4 waits at queue position 1'); end loop;
  for r in select * from t.mk('orgB', 'Poster 5', 5) loop ids := ids || r.id; perform t.ok(r.status = 'waiting' and r.queue_position = 2, 'poster 5 waits at queue position 2'); end loop;
  perform t.as_anon(); perform t.ok((select count(*) from public_posters) = 3, 'public board shows only the 3 live posters (waiting never shown)'); reset role;
  perform t.ok((select count(*) from email_queue where template = 'poster_waiting') = 2, 'waiting emails queued');
  perform t.ok((select count(*) from email_queue where template = 'admin_new_poster') = 5, 'admin emailed for every new poster');
  perform t.as_user('orgA');
  perform t.fails($q$ select create_poster('Poster 1', ist_today()+1, null, 'Adyar', null, 'Arts', true, (select id::text from t.ids where name='orgA')||'/z.webp', (select id::text from t.ids where name='orgA')||'/zt.webp', 600, 800) $q$, 'already posted', 'duplicate (organiser + title + date) is blocked');
  perform t.fails($q$ select create_poster('Bad link', ist_today()+1, 'http://insecure.com', 'Adyar', null, 'Arts', true, (select id::text from t.ids where name='orgA')||'/y.webp', (select id::text from t.ids where name='orgA')||'/yt.webp', 600, 800) $q$, 'booking_url|check', 'non-https booking link is rejected');
  perform t.fails($q$ select create_poster('Stolen path', ist_today()+1, null, 'Adyar', null, 'Arts', true, (select id::text from t.ids where name='orgB')||'/y.webp', (select id::text from t.ids where name='orgB')||'/yt.webp', 600, 800) $q$, 'invalid image path', 'cannot reference another organiser''s files');
  reset role;
  -- admin takes one down -> the first waiting poster is promoted IMMEDIATELY by the trigger
  perform t.as_user('admin'); perform admin_poster_action(ids[1], 'take_down', 'test'); reset role;
  perform t.ok((select status from posters where id = ids[4]) = 'live', 'take-down promotes waiting poster 4 at once (trigger)');
  perform t.ok((select status from posters where id = ids[5]) = 'waiting', 'poster 5 still waiting');
  perform t.ok((select count(*) from email_queue where template = 'poster_promoted') = 1, 'promotion email queued');
  -- organiser deletes (archives) one -> poster 5 promoted
  perform t.as_user('orgA'); perform delete_poster(ids[2]); reset role;
  perform t.ok((select status from posters where id = ids[5]) = 'live', 'organiser delete promotes poster 5 (trigger)');
  perform t.ok((select status from posters where id = ids[2]) = 'archived', 'delete archives instead of hard-deleting');
  perform t.ok((select count(*) from posters where id = ids[2]) = 1, 'archived row still exists');
  -- admin hard delete of a live poster also frees the slot
  perform t.ok((select count(*) from posters where status = 'live') = 3, 'board is full again (3 of 3)');
end $$;

-- ---------------------------------------------------------------- organiser edit guard
do $$
declare p uuid := (select id from posters where title = 'Poster 3');
begin
  perform t.as_user('orgB');
  update posters set title = 'Poster 3 (renamed)' where id = p;
  perform t.ok((select title from posters where id = p) = 'Poster 3 (renamed)', 'organiser can edit their own title');
  perform t.fails(format($q$ update posters set status = 'waiting' where id = %L $q$, p), 'cannot change|permission denied', 'organiser cannot change status directly (column grant)');
  perform t.fails(format($q$ update posters set views = 99999 where id = %L $q$, p), 'cannot change|permission denied', 'organiser cannot fake view counts (column grant)');
  perform t.ok((select count(*) from posters where organiser_id <> (select id from t.ids where name='orgB')) = 0, 'organiser sees only their own posters');
  perform t.ok((select count(*) from my_posters) = (select count(*) from posters where organiser_id = (select id from t.ids where name='orgB')), 'my_posters limited to own');
  perform t.ok((select count(*) from activity_log) = 0, 'organiser cannot read the activity log (RLS hides rows)');
  perform t.fails($q$ select admin_stats() $q$, 'admins only', 'organiser cannot call admin_stats');
  reset role;
  perform t.as_user('orgA');
  update posters set title = 'hacked' where id = p;
  reset role;
  perform t.ok((select title from posters where id = p) = 'Poster 3 (renamed)', 'organiser A cannot edit organiser B''s poster');
end $$;

-- ---------------------------------------------------------------- midnight IST expiry
do $$
declare today date; lateB timestamptz := '2026-03-10 18:29:59+00'; lateC timestamptz := '2026-03-10 18:30:00+00';
        pid uuid; wid uuid;
begin
  perform t.ok((lateB at time zone 'Asia/Kolkata')::date = date '2026-03-10', '18:29:59 UTC is still 10 March in IST');
  perform t.ok((lateC at time zone 'Asia/Kolkata')::date = date '2026-03-11', '18:30:00 UTC (00:00 IST) is 11 March: the event day has ended');
  today := ist_today();
  -- a poster whose date passed yesterday, still marked live because "the job ran late"
  insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, area, category, status, image_path, thumb_path, width, height, confirmed_at)
    select id, 'orgA', 'orga@test.dev', 'Yesterday event', today - 1, 'Adyar', 'Arts', 'live', 'x/a.webp', 'x/b.webp', 600, 800, now() from t.ids where name = 'orgA' returning id into pid;
  insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, area, category, status, image_path, thumb_path, width, height, confirmed_at)
    select id, 'orgA', 'orga@test.dev', 'Today event', today, 'Adyar', 'Arts', 'waiting', 'x/a.webp', 'x/b.webp', 600, 800, now() from t.ids where name = 'orgA' returning id into wid;
  perform t.as_anon();
  perform t.ok((select count(*) from public_posters where title = 'Yesterday event') = 0, 'public query hides an expired poster even though no job has run (reliability layer 1)');
  reset role;
  perform t.ok((select count(*) from public_posters) <= 3, 'public query never returns more than the board limit');
  -- a waiting poster whose date has passed is archived by the job, never shown
  update posters set event_date = today - 1 where id = wid;
  perform rebalance();
  perform t.ok((select status from posters where id = pid) = 'expired', 'nightly job marks the expired live poster as expired (layer 2)');
  perform t.ok((select status from posters where id = wid) = 'archived', 'a waiting poster that missed its date is archived');
  perform t.ok((select count(*) from posters where id = pid) = 1, 'expired posters are archived, not deleted');
end $$;

-- ---------------------------------------------------------------- reminders
do $$
declare pid uuid; n1 int; n2 int;
begin
  update posters set event_date = ist_today() + 1 where title = 'Poster 3 (renamed)';
  select queue_reminders() into n1; select queue_reminders() into n2;
  perform t.ok(n1 >= 1 and n2 = 0, 'reminder queued once for events one day away, never twice');
  perform t.ok((select count(*) from email_queue where template = 'event_reminder') = n1, 'reminder emails are in the send queue');
end $$;

-- ---------------------------------------------------------------- analytics
do $$
declare p uuid := (select id from posters where title = 'Poster 3 (renamed)'); v0 int; i int;
begin
  select views into v0 from posters where id = p;
  perform t.as_anon();
  perform record_view(p); perform record_click(p);
  for i in 1..80 loop perform record_view(p); end loop;
  reset role;
  perform t.ok((select views from posters where id = p) between v0 + 2 and v0 + 61, 'views counted, flood limited per minute');
  perform t.ok((select clicks from posters where id = p) = 1, 'booking clicks counted');
  perform t.ok((select count(*) from poster_daily_stats where poster_id = p and day = ist_today()) = 1, 'daily aggregate row stored');
  perform t.as_anon();
  perform t.fails($q$ select * from poster_daily_stats $q$, 'permission denied', 'anonymous cannot read analytics');
  reset role;
  perform t.as_anon(); perform report_poster(p, 'looks like a political rally'); reset role;
  perform t.ok((select count(*) from reports) = 1 and (select count(*) from email_queue where template = 'admin_report') = 1, 'report stored and admin emailed');
end $$;

-- ---------------------------------------------------------------- admin stats / actions
do $$
declare s jsonb; p uuid := (select id from posters where title = 'Poster 3 (renamed)');
begin
  perform t.as_user('admin');
  s := admin_stats();
  perform t.ok((s->>'live')::int = (select count(*) from posters where status = 'live') and (s->>'limit')::int = 3, 'admin_stats reports live x of limit');
  perform t.ok(jsonb_array_length(s->'daily') = 14, 'admin_stats returns 14 daily buckets for the chart');
  perform admin_poster_action(p, 'extend', '7');
  perform admin_poster_action(p, 'out_of_scope', 'Not an eligible event');
  reset role;
  perform t.ok((select status from posters where id = p) = 'taken_down' and (select count(*) from email_queue where template = 'poster_out_of_scope') = 1, 'Out of scope takes the poster down and emails the organiser');
  perform t.as_user('admin'); perform admin_set_organiser_status((select id from t.ids where name='orgA'), 'suspended', 'spam'); reset role;
  perform t.ok((select count(*) from posters where organiser_id = (select id from t.ids where name='orgA') and status in ('live','waiting')) = 0, 'suspending an organiser takes their posters down');
  perform t.ok((select count(*) from email_queue where template = 'organiser_suspended') = 1, 'suspension email queued');
  perform t.as_user('orgA'); perform t.fails($q$ select create_poster('After suspend', ist_today()+9, null, 'Adyar', null, 'Arts', true, (select id::text from t.ids where name='orgA')||'/s.webp', (select id::text from t.ids where name='orgA')||'/st.webp', 600, 800) $q$, 'not approved', 'suspended organiser cannot post'); reset role;
end $$;

-- ---------------------------------------------------------------- review flags
do $$
declare f text[];
begin
  perform t.as_user('admin');
  perform t.ok((select count(*) from admin_posters) > 0, 'admin sees every poster');
  perform t.ok((select count(*) from admin_posters where 'Category: Other' = any(flags)) = 0, 'no Other-category flags yet');
  reset role;
  update posters set category = 'Other' where title = 'Poster 1';
  perform t.as_user('admin');
  perform t.ok((select count(*) from admin_posters where title = 'Poster 1' and 'Category: Other' = any(flags)) = 1, 'category "Other" is flagged for review');
  perform t.ok((select count(*) from admin_posters where title = 'Poster 1' and flags::text like '%New link domain%') = 1, 'unseen booking-link domain is flagged');
  perform admin_poster_action((select id from posters where title = 'Poster 1'), 'mark_reviewed');
  perform t.ok((select count(*) from admin_posters where title = 'Poster 1' and cardinality(flags) > 0) = 0, 'mark reviewed clears flags');
  reset role;
  perform t.as_user('orgB'); perform t.ok((select count(*) from admin_posters) = 0, 'organisers see nothing through admin_posters'); reset role;
end $$;

-- ---------------------------------------------------------------- terms re-acceptance
do $$
begin
  perform t.as_user('admin'); update settings set terms_version = '2027-01-01'; reset role;
  perform t.as_user('orgB');
  perform t.fails($q$ select create_poster('Needs terms', ist_today()+9, null, 'Adyar', null, 'Arts', true, (select id::text from t.ids where name='orgB')||'/n.webp', (select id::text from t.ids where name='orgB')||'/nt.webp', 600, 800) $q$, 'latest terms', 'new Terms version blocks uploads until re-accepted');
  perform accept_terms('2027-01-01');
  reset role;
  perform t.ok((select count(*) from terms_acceptances where version = '2027-01-01') = 1, 're-acceptance stored with new version');
end $$;

-- ---------------------------------------------------------------- storage safety net (policy level)
do $$
declare mine text := (select id::text from t.ids where name = 'orgB'); other text := (select id::text from t.ids where name = 'orgC');
begin
  perform t.as_user('orgB');
  insert into storage.objects (bucket_id, name) values ('posters', mine || '/ok.webp');
  perform t.ok(true, 'approved organiser can upload into their own folder');
  perform t.fails(format($q$ insert into storage.objects (bucket_id, name) values ('posters', %L) $q$, other || '/evil.webp'), 'row-level security', 'cannot upload into someone else''s folder');
  reset role;
  perform t.as_user('orgC');
  perform t.fails(format($q$ insert into storage.objects (bucket_id, name) values ('posters', %L) $q$, other || '/pending.webp'), 'row-level security', 'pending organiser cannot upload files');
  reset role;
  perform t.ok((select file_size_limit from storage.buckets where id = 'posters') = 716800 and (select allowed_mime_types from storage.buckets where id = 'posters') = array['image/webp'], 'bucket limits size (700 KB) and type (image/webp only)');
end $$;

-- ---------------------------------------------------------------- retention
do $$
declare pid uuid;
begin
  insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, area, category, status, image_path, thumb_path, width, height, confirmed_at)
    select id, 'orgB', 'orgb@test.dev', 'Ancient event', ist_today() - (365 * 3 + 5), 'Adyar', 'Arts', 'expired', 'x/old.webp', 'x/oldt.webp', 600, 800, now() from t.ids where name = 'orgB' returning id into pid;
  perform t.ok((select count(*) from retention_due() where id = pid) = 1, 'poster older than the retention period is due for cleanup');
  perform t.ok((select count(*) from retention_due() where id <> pid) = 0, 'recent posters are not due');
  perform retention_mark(pid);
  perform t.ok((select organiser_email is null and anonymised_at is not null and image_path = '' from posters where id = pid), 'retention anonymises organiser details and clears image paths');
  perform t.ok((select count(*) from activity_log where action = 'retention_anonymised') = 1, 'retention is logged');
end $$;

select 'ALL TESTS PASSED' as result;
