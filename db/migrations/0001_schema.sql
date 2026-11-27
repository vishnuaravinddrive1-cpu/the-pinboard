-- Pin Board schema for Neon (plain Postgres). Applied by db/migrate.mjs.
-- All "today" logic uses IST via ist_today(); the browser clock never decides expiry.
-- Security model: the browser never talks to the database. The API (a Cloudflare Worker) connects as the database owner and,
-- for every request, runs inside ONE transaction that does `set local role anon|authenticated` and sets app.uid.
-- Row Level Security below then applies exactly as it would for a real end user.

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant anon, authenticated to current_user;   -- lets the owner 'set local role' to either

-- current end user, as set by the API for this transaction
create function app_uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid $$;


create type user_role        as enum ('organiser', 'admin');
create type organiser_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type poster_status    as enum ('waiting', 'live', 'expired', 'taken_down', 'archived');

create function ist_today() returns date language sql stable as
$$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------- settings
create table settings (
  id             int primary key default 1 check (id = 1),
  board_limit    int  not null default 100 check (board_limit between 1 and 1000),
  reminder_days  int  not null default 1   check (reminder_days between 0 and 30),
  admin_email    text not null default 'thecuriosityquotient@gmail.com',
  terms_version  text not null default '0.1',
  retention_years int not null default 3   check (retention_years between 0 and 20),
  categories     text[] not null default array['Experience','Arts','Knowledge','Discussion','Social','Other'],
  areas          text[] not null default array['Adyar','Alwarpet','Anna Nagar','Besant Nagar','Chromepet','ECR','Egmore','Guindy','Kilpauk','Kodambakkam','Mylapore','Nungambakkam','OMR','Perungudi','Porur','Royapettah','T. Nagar','Tambaram','Thiruvanmiyur','Velachery','West Mambalam','Other']
);
insert into settings default values;

-- ---------------------------------------------------------------- profiles
-- Sign-in: no passwords. Personal sign-in links (sent by the admin) or Google. Only the API (owner role) can read these tables.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);
create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);
-- Personal sign-in links. The admin emails one to each approved organiser; the link signs them in on any device until it
-- expires or is revoked. Only a hash of the token is stored.
create table access_links (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);
create index access_links_user on access_links (user_id, created_at desc);

create table profiles (
  id                uuid primary key references users(id) on delete cascade,
  email             text not null,
  display_name      text not null default '',
  role              user_role not null default 'organiser',
  status            organiser_status not null default 'pending',
  terms_version     text,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now()
);

create table terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- posters
create table posters (
  id              uuid primary key default gen_random_uuid(),
  organiser_id    uuid not null references profiles(id),
  organiser_name  text,           -- snapshots, so records can be anonymised without touching profiles
  organiser_email text,
  title           text not null check (char_length(title) between 3 and 120),
  event_date      date not null,
  booking_url     text check (booking_url is null or (booking_url ~* '^https://[^\s]+\.[^\s]+$' and char_length(booking_url) <= 500)),
  area            text not null check (char_length(area) between 1 and 80),
  category        text not null,
  status          poster_status not null default 'waiting',
  queued_at       timestamptz not null default now(),
  image_path      text not null,
  thumb_path      text not null,
  image_bytes     int not null default 0,
  thumb_bytes     int not null default 0,
  width           int not null check (width between 50 and 6000),
  height          int not null check (height between 50 and 6000),
  confirmed_at    timestamptz not null,   -- the "in Chennai + fits categories + read Terms" tick
  reviewed        boolean not null default false,
  taken_down_reason text,
  views           int not null default 0,
  clicks          int not null default 0,
  reminder_sent   boolean not null default false,
  created_at      timestamptz not null default now(),
  live_at         timestamptz,
  archived_at     timestamptz,
  anonymised_at   timestamptz
);
create unique index posters_no_duplicates on posters (organiser_id, lower(title), event_date);
create index posters_status_date on posters (status, event_date);
create index posters_queue on posters (queued_at) where status = 'waiting';

create table poster_daily_stats (
  poster_id uuid not null references posters(id) on delete cascade,
  day date not null,
  views int not null default 0,
  clicks int not null default 0,
  primary key (poster_id, day)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references posters(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create table rate_limits (key text primary key, window_start timestamptz not null, n int not null default 0);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null default 'system',
  action text not null,
  detail text not null default ''
);
create index activity_log_at on activity_log (at desc);

-- The admin's OUTBOX: emails that need to be sent by hand. The app writes who, what and the facts; the API turns each row
-- into a ready-to-send subject and text. Nothing is ever sent automatically.
create table email_queue (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','sent','skipped')),
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_queue_status on email_queue (status, created_at);

create table purge_queue (path text primary key, created_at timestamptz not null default now());

-- Poster images when the API runs without R2 (the default). Keys look like '<user id>/<uuid>.webp'.
create table image_blobs (key text primary key, data bytea not null, bytes int not null, created_at timestamptz not null default now());


-- ---------------------------------------------------------------- helpers
create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = app_uid() and role = 'admin' and status = 'approved') $$;

create function is_approved() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles p, settings s where p.id = app_uid() and p.status = 'approved'
                    and p.terms_version = s.terms_version) $$;

create function log_event(p_actor text, p_action text, p_detail text) returns void
language sql security definer set search_path = public as
$$ insert into activity_log (actor, action, detail) values (coalesce(p_actor,'system'), p_action, coalesce(p_detail,'')) $$;

create function enqueue_email(p_to text, p_template text, p_payload jsonb, p_dedupe text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into email_queue (to_email, template, payload, dedupe_key) values (p_to, p_template, coalesce(p_payload,'{}'), p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

create function admin_email() returns text language sql stable security definer set search_path = public as
$$ select admin_email from settings where id = 1 $$;

-- ---------------------------------------------------------------- queue logic
-- Promote waiting posters (FIFO) into free slots. Called by triggers, the nightly job and admin actions.
create function promote_waiting() returns int language plpgsql security definer set search_path = public as $$
declare lim int; r record; n int := 0;
begin
  perform pg_advisory_xact_lock(4242);
  select board_limit into lim from settings where id = 1;
  for r in select id from posters where status = 'waiting' and event_date >= ist_today() order by queued_at, created_at loop
    exit when (select count(*) from posters where status = 'live') >= lim;
    update posters set status = 'live', live_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Archive expired posters, then promote. Run at 00:00 IST; never relied on for correctness of the public query.
create function rebalance() returns int language plpgsql security definer set search_path = public as $$
declare n int; e int; w int;
begin
  perform pg_advisory_xact_lock(4242);
  with u as (update posters set status = 'expired', archived_at = now() where status = 'live' and event_date < ist_today() returning 1)
  select count(*) into e from u;
  with u as (update posters set status = 'archived', archived_at = now() where status = 'waiting' and event_date < ist_today() returning 1)
  select count(*) into w from u;
  n := promote_waiting();
  if e + w + n > 0 then perform log_event('system', 'rebalance', format('expired %s, archived waiting %s, promoted %s', e, w, n)); end if;
  return n;
end $$;

create function queue_reminders() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; lead int;
begin
  select reminder_days into lead from settings where id = 1;
  for r in select * from posters where status = 'live' and not reminder_sent and event_date = ist_today() + lead loop
    perform enqueue_email(r.organiser_email, 'event_reminder', jsonb_build_object('name', r.organiser_name, 'title', r.title, 'event_date', r.event_date, 'poster_id', r.id), 'reminder-' || r.id);
    update posters set reminder_sent = true where id = r.id;
    n := n + 1;
  end loop;
  if n > 0 then perform log_event('system', 'reminders_queued', n::text); end if;
  return n;
end $$;

create function nightly_job() returns void language plpgsql security definer set search_path = public as $$
begin perform rebalance(); perform queue_reminders(); end $$;

-- Status-change trigger: emails, log, and immediate queue movement when a live slot frees up.
create function posters_status_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'live' then perform promote_waiting(); end if;
    return old;
  end if;
  if new.status = old.status then return new; end if;
  if old.status = 'waiting' and new.status = 'live' then
    perform enqueue_email(new.organiser_email, 'poster_promoted', jsonb_build_object('name', new.organiser_name, 'title', new.title, 'event_date', new.event_date, 'poster_id', new.id));
    perform log_event('system', 'queue_promoted', new.title);
  end if;
  if old.status = 'live' and new.status <> 'live' then
    perform log_event('system', 'poster_' || new.status, new.title);
    perform promote_waiting();
  end if;
  return new;
end $$;
create trigger posters_status_trg after update of status or delete on posters
  for each row execute function posters_status_changed();

-- ---------------------------------------------------------------- guard organiser edits
-- Runs as the calling role (SECURITY INVOKER) so current_user tells us whether this is a direct client write
-- (role 'authenticated') or one of our own SECURITY DEFINER functions (role = owner).
create function guard_poster_update() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not is_admin() then
    if new.status is distinct from old.status or new.organiser_id is distinct from old.organiser_id
       or new.views is distinct from old.views or new.clicks is distinct from old.clicks
       or new.queued_at is distinct from old.queued_at or new.reviewed is distinct from old.reviewed
       or new.taken_down_reason is distinct from old.taken_down_reason or new.category is distinct from old.category
       or new.area is distinct from old.area or new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'You cannot change that field.';
    end if;
    if new.event_date is distinct from old.event_date and new.event_date < ist_today() then raise exception 'The event date is in the past.'; end if;
    if new.image_path is distinct from old.image_path and split_part(new.image_path, '/', 1) <> app_uid()::text then raise exception 'Invalid image path.'; end if;
    if new.thumb_path is distinct from old.thumb_path and split_part(new.thumb_path, '/', 1) <> app_uid()::text then raise exception 'Invalid image path.'; end if;
  end if;
  return new;
end $$;
create trigger posters_a_guard before update on posters for each row execute function guard_poster_update();

-- Bookkeeping after a permitted edit (SECURITY DEFINER: may write the log and purge queue).
create function posters_edit_bookkeeping() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.image_path is distinct from old.image_path and old.image_path <> '' then
    insert into purge_queue values (old.image_path), (old.thumb_path) on conflict do nothing;
  end if;
  if new.title is distinct from old.title or new.event_date is distinct from old.event_date
     or new.booking_url is distinct from old.booking_url or new.image_path is distinct from old.image_path then
    perform log_event(coalesce((select email from profiles where id = app_uid()), 'system'), 'poster_edited', new.title);
  end if;
  if new.event_date is distinct from old.event_date then new.reminder_sent := false; end if;
  return new;
end $$;
create trigger posters_b_bookkeeping before update on posters for each row execute function posters_edit_bookkeeping();

-- ---------------------------------------------------------------- new users
-- Called by the API (owner role only) after an email code or Google sign-in succeeded. Creates the account on first use.
create function register_user(p_email text, p_name text, p_terms text, p_bootstrap_admin text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid; cur text; accepted text; nm text; isadm boolean; em text := lower(trim(p_email));
begin
  select id into uid from users where email = em;
  if uid is not null then return uid; end if;
  select terms_version into cur from settings where id = 1;
  accepted := case when p_terms = cur then cur end;
  nm := left(regexp_replace(coalesce(nullif(trim(p_name), ''), split_part(em, '@', 1)), '[<>]', '', 'g'), 80);
  insert into users (email) values (em) returning id into uid;
  -- The very first sign-in by the configured bootstrap admin email becomes the admin (only while no admin exists).
  isadm := p_bootstrap_admin is not null and lower(trim(p_bootstrap_admin)) = em and not exists (select 1 from profiles where role = 'admin');
  insert into profiles (id, email, display_name, role, status, terms_version, terms_accepted_at)
  values (uid, em, nm, case when isadm then 'admin'::user_role else 'organiser'::user_role end,
          case when isadm then 'approved'::organiser_status else 'pending'::organiser_status end,
          accepted, case when accepted is not null then now() end);
  if accepted is not null then
    insert into terms_acceptances (user_id, version) values (uid, accepted);
    perform log_event(em, 'terms_accepted', 'version ' || accepted);
  end if;
  perform log_event(em, 'signup', case when isadm then 'bootstrap admin' else 'awaiting approval' end);
  return uid;
end $$;

create function accept_terms(p_version text) returns void language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if app_uid() is null then raise exception 'Please log in.'; end if;
  select terms_version into cur from settings where id = 1;
  if p_version <> cur then raise exception 'These Terms are out of date. Refresh the page.'; end if;
  update profiles set terms_version = cur, terms_accepted_at = now() where id = app_uid();
  insert into terms_acceptances (user_id, version) values (app_uid(), cur);
  perform log_event((select email from profiles where id = app_uid()), 'terms_accepted', 'version ' || cur);
end $$;

-- ---------------------------------------------------------------- organiser RPCs
create function create_poster(
  p_title text, p_event_date date, p_booking_url text, p_area text, p_area_other text, p_category text,
  p_confirmed boolean, p_image_path text, p_thumb_path text, p_width int, p_height int,
  p_image_bytes int default 0, p_thumb_bytes int default 0
) returns table (id uuid, status poster_status, queue_position bigint)
language plpgsql security definer set search_path = public as $$
declare me profiles; s settings; st poster_status; pid uuid; area_final text; pos bigint; lim int;
begin
  if app_uid() is null then raise exception 'Please log in.'; end if;
  select * into me from profiles where profiles.id = app_uid();
  select * into s from settings where settings.id = 1;
  if me.status <> 'approved' then raise exception 'Your account is not approved yet.'; end if;
  if me.terms_version is distinct from s.terms_version then raise exception 'Please accept the latest Terms first.'; end if;
  if not coalesce(p_confirmed, false) then raise exception 'Please tick the confirmation box.'; end if;
  if p_event_date < ist_today() then raise exception 'The event date is in the past.'; end if;
  if not (p_category = any (s.categories)) then raise exception 'Unknown category.'; end if;
  if not (p_area = any (s.areas)) then raise exception 'Unknown area.'; end if;
  if split_part(p_image_path, '/', 1) <> app_uid()::text or split_part(p_thumb_path, '/', 1) <> app_uid()::text then raise exception 'Invalid image path.'; end if;
  -- light per-organiser upload rate limit: 30 posters / hour
  if (select count(*) from posters where organiser_id = app_uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You are posting very fast. Please try again in a little while.';
  end if;
  area_final := case when p_area = 'Other' then 'Other: ' || left(regexp_replace(coalesce(p_area_other,''), '[<>]', '', 'g'), 60) else p_area end;

  perform pg_advisory_xact_lock(4242);   -- two uploads can never both take the last slot
  select board_limit into lim from settings where settings.id = 1;
  st := case when (select count(*) from posters where posters.status = 'live') < lim then 'live' else 'waiting' end;
  begin
    insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, booking_url, area, category, status,
                         image_path, thumb_path, image_bytes, thumb_bytes, width, height, confirmed_at, live_at)
    values (app_uid(), me.display_name, me.email, regexp_replace(trim(p_title), '[<>]', '', 'g'), p_event_date, nullif(trim(p_booking_url), ''),
            area_final, p_category, st, p_image_path, p_thumb_path, coalesce(p_image_bytes,0), coalesce(p_thumb_bytes,0), p_width, p_height, now(), case when st = 'live' then now() end)
    returning posters.id into pid;
  exception when unique_violation then
    raise exception 'You already posted this event (same title and date).';
  end;
  select count(*) into pos from posters where posters.status = 'waiting' and queued_at <= (select queued_at from posters where posters.id = pid);
  perform log_event(me.email, case when st = 'live' then 'poster_posted' else 'poster_queued' end, p_title);
  return query select pid, st, case when st = 'waiting' then pos end;
end $$;

create function delete_poster(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Never hard-delete: archive and keep for the retention period.
  update posters set status = 'archived', archived_at = now() where posters.id = p_id and organiser_id = app_uid() and anonymised_at is null;
  if not found then raise exception 'Poster not found.'; end if;
  perform log_event((select email from profiles where id = app_uid()), 'poster_deleted', (select title from posters where id = p_id));
end $$;

-- ---------------------------------------------------------------- analytics (no identities, no IPs)
create function bump(p_key text, p_max int, p_seconds int default 60) returns boolean language plpgsql security definer set search_path = public as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds); cur int;
begin
  insert into rate_limits (key, window_start, n) values (p_key, w, 1)
  on conflict (key) do update set n = case when rate_limits.window_start = w then rate_limits.n + 1 else 1 end, window_start = w
  returning n into cur;
  return cur <= p_max;
end $$;

create function record_view(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not bump('v:' || p_id, 60) then return; end if;
  update posters set views = views + 1 where id = p_id and status = 'live';
  if found then
    insert into poster_daily_stats (poster_id, day, views) values (p_id, ist_today(), 1)
    on conflict (poster_id, day) do update set views = poster_daily_stats.views + 1;
  end if;
end $$;

create function record_click(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not bump('c:' || p_id, 60) then return; end if;
  update posters set clicks = clicks + 1 where id = p_id and status = 'live';
  if found then
    insert into poster_daily_stats (poster_id, day, clicks) values (p_id, ist_today(), 1)
    on conflict (poster_id, day) do update set clicks = poster_daily_stats.clicks + 1;
  end if;
end $$;

create function report_poster(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not bump('r:all', 30) then raise exception 'Too many reports right now. Please try again in a minute.'; end if;
  select title into t from posters where id = p_id and status = 'live';
  if t is null then raise exception 'Poster not found.'; end if;
  insert into reports (poster_id, reason) values (p_id, left(regexp_replace(p_reason, '[<>]', '', 'g'), 500));
  perform log_event('viewer', 'reported', t);
end $$;

-- ---------------------------------------------------------------- admin RPCs
-- Mark an outbox email as sent by hand (or skipped, or put back to 'queued').
create function admin_set_outbox(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if p_status not in ('queued', 'sent', 'skipped') then raise exception 'Unknown status.'; end if;
  update email_queue set status = p_status, sent_at = case when p_status = 'sent' then now() end where id = p_id;
  if not found then raise exception 'Email not found.'; end if;
end $$;

-- First-time admin set-up (API only): works only while NO admin exists yet.
create function bootstrap_admin(p_email text, p_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; em text := lower(trim(p_email));
begin
  if exists (select 1 from profiles where role = 'admin') then raise exception 'An admin already exists.'; end if;
  uid := register_user(em, p_name, null, null);
  update profiles set role = 'admin', status = 'approved' where id = uid;
  perform log_event(em, 'admin_bootstrap', 'first admin created');
  return uid;
end $$;

create function admin_set_organiser_status(p_id uuid, p_status organiser_status, p_reason text default null, p_extra jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  update profiles set status = p_status where id = p_id and role = 'organiser' returning * into p;
  if not found then raise exception 'Organiser not found.'; end if;
  perform log_event((select email from profiles where id = app_uid()), 'organiser_' || p_status, p.email || coalesce(' - ' || p_reason, ''));
  if p_status in ('approved', 'rejected', 'suspended') then
    perform enqueue_email(p.email, 'organiser_' || p_status, jsonb_build_object('name', p.display_name, 'reason', p_reason) || coalesce(p_extra, '{}'));
  end if;
  if p_status = 'suspended' then
    update posters set status = 'taken_down', taken_down_reason = 'Organiser suspended' where organiser_id = p_id and status in ('live', 'waiting');
  end if;
end $$;

create function admin_poster_action(p_id uuid, p_action text, p_arg text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p posters; lim int; liveN int; minq timestamptz; nb posters; actor text;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select * into p from posters where id = p_id for update;
  if not found then raise exception 'Poster not found.'; end if;
  actor := (select email from profiles where id = app_uid());
  select board_limit into lim from settings where id = 1;
  select count(*) into liveN from posters where status = 'live';
  case p_action
    when 'take_down' then
      update posters set status = 'taken_down', taken_down_reason = coalesce(nullif(p_arg,''), 'Taken down by admin') where id = p_id;
    when 'out_of_scope' then
      update posters set status = 'taken_down', taken_down_reason = coalesce(nullif(p_arg,''), 'Out of scope (Terms 3.1)') where id = p_id;
      perform enqueue_email(p.organiser_email, 'poster_out_of_scope', jsonb_build_object('name', p.organiser_name, 'title', p.title, 'reason', coalesce(nullif(p_arg,''), 'Out of scope (Terms 3.1)')));
    when 'restore' then
      if p.event_date < ist_today() then raise exception 'The event date has passed. Extend it first.'; end if;
      select min(queued_at) into minq from posters where status = 'waiting';
      update posters set status = (case when liveN < lim then 'live' else 'waiting' end)::poster_status, taken_down_reason = null,
             queued_at = coalesce(minq - interval '1 second', now()) where id = p_id;
    when 'extend' then
      update posters set event_date = event_date + coalesce(nullif(p_arg,'')::int, 1), reminder_sent = false,
             status = (case when status in ('expired', 'archived') then 'waiting' else status::text end)::poster_status,
             queued_at = case when status in ('expired', 'archived') then now() else queued_at end where id = p_id;
      perform promote_waiting();
    when 'promote' then
      if p.status <> 'waiting' then raise exception 'Only waiting posters can be promoted.'; end if;
      if liveN >= lim then raise exception 'The board is full. Take a poster down first.'; end if;
      update posters set status = 'live', live_at = now() where id = p_id;
    when 'mark_reviewed' then update posters set reviewed = true where id = p_id;
    when 'move_up', 'move_down' then
      if p.status <> 'waiting' then raise exception 'Only waiting posters can be reordered.'; end if;
      select * into nb from posters where status = 'waiting'
        and (case when p_action = 'move_up' then (queued_at, created_at) < (p.queued_at, p.created_at) else (queued_at, created_at) > (p.queued_at, p.created_at) end)
        order by case when p_action = 'move_up' then queued_at end desc, case when p_action = 'move_down' then queued_at end asc limit 1;
      if found then
        update posters set queued_at = nb.queued_at where id = p.id;
        update posters set queued_at = p.queued_at where id = nb.id;
      end if;
    when 'delete' then
      insert into purge_queue values (p.image_path), (p.thumb_path) on conflict do nothing;
      delete from posters where id = p_id;
    else raise exception 'Unknown action.';
  end case;
  perform log_event(actor, 'poster_' || p_action, p.title);
end $$;

create function admin_stats() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select jsonb_build_object(
    'live', (select count(*) from posters where status = 'live'),
    'limit', (select board_limit from settings where id = 1),
    'waiting', (select count(*) from posters where status = 'waiting'),
    'archived', (select count(*) from posters where status in ('expired', 'archived')),
    'pending', (select count(*) from profiles where role = 'organiser' and status = 'pending'),
    'approved', (select count(*) from profiles where role = 'organiser' and status = 'approved'),
    'suspended', (select count(*) from profiles where role = 'organiser' and status = 'suspended'),
    'views', (select coalesce(sum(views), 0) from posters),
    'clicks', (select coalesce(sum(clicks), 0) from posters),
    'perWeek', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'count', c) order by w) from
        (select date_trunc('week', event_date)::date::text w, count(*) c from posters group by 1 order by 1 desc limit 8) x), '[]'),
    'topCategories', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'count', c) order by c desc) from
        (select category, count(*) c from posters group by 1) x), '[]'),
    'daily', (select jsonb_agg(jsonb_build_object('day', d::date::text, 'views', coalesce(s.v, 0), 'clicks', coalesce(s.c, 0)) order by d) from
        generate_series(ist_today() - 13, ist_today(), '1 day') d
        left join (select day, sum(views) v, sum(clicks) c from poster_daily_stats group by day) s on s.day = d::date),
    'storageMb', round(coalesce((select sum(image_bytes + thumb_bytes) from posters where anonymised_at is null), 0) / 1048576.0, 2),
    'outbox', (select count(*) from email_queue where status = 'queued')
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------- views
-- The ONLY thing anonymous visitors can read: live, unexpired posters, capped at the board limit, no organiser data.
create view public_posters with (security_barrier = true) as
  select id, title, event_date, booking_url, area, category, image_path, thumb_path, width, height
  from posters
  where status = 'live' and event_date >= ist_today()
  order by event_date asc, created_at asc
  limit (select board_limit from settings where id = 1);

create view my_posters with (security_barrier = true) as
  select * from (
    select p.*, case when p.status = 'waiting' then row_number() over (partition by p.status order by p.queued_at, p.created_at) end as queue_position
    from posters p
  ) q where q.organiser_id = app_uid() and q.anonymised_at is null;

create view admin_posters with (security_barrier = true) as
  select * from (
    select p.*,
      case when p.status = 'waiting' then row_number() over (partition by p.status order by p.queued_at, p.created_at) end as queue_position,
      case when p.reviewed then array[]::text[] else array_remove(array[
        case when p.category = 'Other' then 'Category: Other' end,
        case when p.area like 'Other%' then 'Area: other' end,
        case when p.booking_url is not null and not exists (
          select 1 from posters o where o.id <> p.id
            and substring(o.booking_url from '^https://([^/:?#]+)') = substring(p.booking_url from '^https://([^/:?#]+)')
            and (o.reviewed or o.created_at < p.created_at))
          then 'New link domain: ' || substring(p.booking_url from '^https://([^/:?#]+)') end
      ], null) end as flags
    from posters p
  ) q where is_admin();

create view admin_organisers with (security_barrier = true) as
  select pr.id, pr.email, pr.display_name, pr.role, pr.status, pr.terms_version, pr.terms_accepted_at, pr.created_at,
         (select count(*) from posters where organiser_id = pr.id) as poster_count
  from profiles pr where pr.role = 'organiser' and is_admin();

-- ---------------------------------------------------------------- retention (called by the `retention` edge function)
create function retention_due() returns table (id uuid, image_path text, thumb_path text) language sql security definer set search_path = public as $$
  select p.id, p.image_path, p.thumb_path from posters p, settings s
  where p.anonymised_at is null and p.status <> 'live' and p.status <> 'waiting'
    and p.event_date < ist_today() - (s.retention_years * 365)
$$;
create function retention_mark(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update posters set organiser_name = 'anonymised', organiser_email = null, title = '[removed]', booking_url = null,
         image_path = '', thumb_path = '', anonymised_at = now(), status = 'archived' where id = p_id;
  perform log_event('system', 'retention_anonymised', p_id::text);
end $$;

-- ---------------------------------------------------------------- Row Level Security
alter table settings enable row level security;
alter table profiles enable row level security;
alter table terms_acceptances enable row level security;
alter table posters enable row level security;
alter table poster_daily_stats enable row level security;
alter table reports enable row level security;
alter table rate_limits enable row level security;
alter table activity_log enable row level security;
alter table email_queue enable row level security;
alter table purge_queue enable row level security;
alter table image_blobs enable row level security;
alter table users enable row level security;
alter table sessions enable row level security;
alter table access_links enable row level security;

create policy settings_read on settings for select to authenticated using (true);
create policy settings_admin_write on settings for update to authenticated using (is_admin()) with check (is_admin());

create policy profiles_self_read on profiles for select to authenticated using (id = app_uid() or is_admin());
create policy profiles_admin_write on profiles for update to authenticated using (is_admin()) with check (is_admin());

create policy terms_read on terms_acceptances for select to authenticated using (user_id = app_uid() or is_admin());

create policy posters_owner_read on posters for select to authenticated using (organiser_id = app_uid() or is_admin());
create policy posters_owner_update on posters for update to authenticated
  using ((organiser_id = app_uid() and is_approved() and anonymised_at is null) or is_admin())
  with check ((organiser_id = app_uid() and is_approved()) or is_admin());
create policy posters_admin_delete on posters for delete to authenticated using (is_admin());

create policy stats_admin on poster_daily_stats for select to authenticated using (is_admin());
create policy reports_admin on reports for select to authenticated using (is_admin());
create policy reports_admin_update on reports for update to authenticated using (is_admin()) with check (is_admin());
create policy log_admin on activity_log for select to authenticated using (is_admin());
create policy email_admin on email_queue for select to authenticated using (is_admin());   -- changes go through admin_set_outbox()
-- rate_limits, purge_queue, users, sessions, access_links: no policies and no grants = no client access at all.

-- ---------------------------------------------------------------- grants
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public_posters to anon, authenticated;
grant select on my_posters, admin_posters, admin_organisers to authenticated;
grant select on settings, profiles, terms_acceptances, posters, poster_daily_stats, reports, activity_log, email_queue to authenticated;
grant update (board_limit, reminder_days, admin_email, terms_version, retention_years, categories, areas) on settings to authenticated;
grant update (title, event_date, booking_url, image_path, thumb_path, image_bytes, thumb_bytes, width, height) on posters to authenticated;
grant update (handled) on reports to authenticated;
grant update (status) on profiles to authenticated;
grant delete on posters to authenticated;
grant execute on function record_view(uuid), record_click(uuid), report_poster(uuid, text) to anon, authenticated;
grant execute on function app_uid() to anon, authenticated;
grant execute on function admin_set_outbox(uuid, text) to authenticated;
grant execute on function accept_terms(text), create_poster(text, date, text, text, text, text, boolean, text, text, int, int, int, int), delete_poster(uuid),
  admin_set_organiser_status(uuid, organiser_status, text, jsonb), admin_poster_action(uuid, text, text), admin_stats(),
  is_admin(), is_approved(), ist_today() to authenticated;
grant execute on function ist_today() to anon;
