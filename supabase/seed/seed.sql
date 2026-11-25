-- Sample data: 1 admin-approved demo organiser + 20 posters (mixed aspect ratios), plus seed_filler(n) for testing the cap/queue.
-- 1) Run seed/upload-seed-images.mjs first (uploads seed/images/*.webp to the "posters" bucket under seed/).
-- 2) Paste this file into the SQL editor.  Remove everything with:  select seed_remove();
do $$
declare uid uuid; i int; dims int[][] := array[[600,800],[800,800],[640,800],[800,450],[600,900],[450,800],[700,990],[800,1000]];
  titles text[] := array['Filter Coffee & Poetry Evening','Chennai Sketch Walk','Tamil Short Film Screening','Intro to Urban Birding','Open Mic: Stories from the City','Climate & Coast Talk','Board Games Meetup','Classical Music Sabha Night','Pottery for Beginners','Public Policy Reading Circle','Heritage Walk: George Town','Data Storytelling Workshop','Book Swap Sunday','Theatre: A Midsummer Night','Philosophy Cafe','Street Photography Meet','Neutral Civic Q&A: Water Supply','Stargazing Night','Language Exchange Evening','Science Cafe: Brains & Beats'];
  cats text[] := array['Arts','Arts','Arts','Experience','Social','Knowledge','Social','Arts','Experience','Discussion','Experience','Knowledge','Social','Arts','Discussion','Arts','Discussion','Experience','Social','Knowledge'];
  areas text[] := array['Mylapore','Egmore','Alwarpet','Adyar','T. Nagar','Besant Nagar','Anna Nagar','Mylapore','ECR','Nungambakkam','Egmore','Guindy','Velachery','Kodambakkam','West Mambalam','Royapettah','Kilpauk','OMR','Thiruvanmiyur','Tambaram'];
begin
  select id into uid from auth.users where email = 'demo-organiser@example.com';
  if uid is null then
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'demo-organiser@example.com', '{"display_name":"Demo Organiser"}') returning id into uid;
  end if;
  update profiles set status = 'approved', terms_version = (select terms_version from settings) where id = uid;
  for i in 1..20 loop
    insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, booking_url, area, category, status, image_path, thumb_path, width, height, confirmed_at, live_at)
    values (uid, 'Demo Organiser', 'demo-organiser@example.com', titles[i], ist_today() + (case when i = 1 then 0 else i * 2 end),
            case when i % 4 = 0 then null else 'https://example.com/book/' || i end, areas[i], cats[i], 'live',
            'seed/' || lpad(i::text, 2, '0') || '.webp', 'seed/' || lpad(i::text, 2, '0') || '.webp',
            dims[((i - 1) % 8) + 1][1], dims[((i - 1) % 8) + 1][2], now(), now())
    on conflict do nothing;
  end loop;
end $$;

-- Adds n extra posters (reusing the seed images) so you can watch the board fill up and the queue form.
create or replace function seed_filler(n int) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := (select id from auth.users where email = 'demo-organiser@example.com'); i int; k int; st poster_status; lim int := (select board_limit from settings);
begin
  for i in 1..n loop
    k := ((i - 1) % 20) + 1;
    st := case when (select count(*) from posters where status = 'live') < lim then 'live' else 'waiting' end;
    insert into posters (organiser_id, organiser_name, organiser_email, title, event_date, area, category, status, image_path, thumb_path, width, height, confirmed_at, live_at)
    values (uid, 'Demo Organiser', 'demo-organiser@example.com', 'Filler event ' || i, ist_today() + 3 + (i % 40), 'Adyar', 'Social', st,
            'seed/' || lpad(k::text, 2, '0') || '.webp', 'seed/' || lpad(k::text, 2, '0') || '.webp', 600, 800, now(), case when st = 'live' then now() end);
  end loop;
end $$;

create or replace function seed_remove() returns void language sql security definer set search_path = public as $$
  delete from posters where organiser_email = 'demo-organiser@example.com';
  delete from auth.users where email = 'demo-organiser@example.com';
$$;
revoke all on function seed_filler(int), seed_remove() from public, anon, authenticated;
-- Test the cap:  select seed_filler(90);   (20 + 90 = 110: 100 live, 10 waiting)
