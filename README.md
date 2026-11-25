# Pin Board

A free digital community notice board for Chennai, run by **The Curiosity Quotient (TCQ)**.
Organisers post event posters; they stay on a dark cork board until the event day ends.

- **Viewer** (`/`): full-screen cork board, no login. Hover/click/double-click posters, share, add to calendar.
- **Organiser** (`/organiser`): sign up (email or Google), get approved, upload posters (JPG/PNG/WebP/PDF).
- **Admin** (`/admin`): approve organisers, take down / restore / extend posters, queue, stats, logs, CSV export, settings.

Stack: Vite + React + TypeScript + Tailwind (static site on **Cloudflare Pages**) · **Supabase** (Postgres + RLS, Auth, Storage, Edge Functions, pg_cron) · **Resend** for email (called only from Supabase Edge Functions). No other server.

```
web/        the website (Vite + React). Build: npm run build -> dist/
supabase/   migrations/, functions/ (edge functions), seed/, tests/ (database tests)
e2e/        Playwright tests (phone + desktop)
docs/       terms.md, privacy.md, brand/, test-report/ (screenshots + results)
.github/    CI (lint, typecheck, build, database tests) and the daily keep-alive ping
```

## Try it now without any accounts (demo mode)

If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are empty, the site runs in **demo mode**: 22 sample posters, and everything (upload, approval, queue, admin) works inside your own browser. Nothing is sent anywhere.

```bash
cd web && npm install && npm run dev
```
Demo logins (any password): `organiser@demo.test`, `newbie@demo.test` (pending), `suspended@demo.test`, `admin@demo.test`.

---

## Fastest way to get it on the web (all free, mostly automatic)

You only create accounts and paste secrets; GitHub then does the rest. (Nobody but you can log in to these accounts, so this part cannot be done for you.)

**A. Website, demo mode (2 minutes, no backend yet)**
- *Cloudflare Pages (recommended):* Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → this repo. Root directory `web`, build command `npm run build`, output `dist`, production branch = your default branch. Leave the `VITE_` variables empty: the site runs in demo mode.
- *or Render:* render.com → New → Blueprint → this repo (uses `render.yaml`). Render's static-site fields (`rootDir`, `routes`) are written from memory and were not verified against its docs; if the Blueprint complains, create a Static Site by hand with the same root/build/publish settings and add a rewrite `/*` → `/index.html`.
- *or fully from GitHub:* add repository secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Pages") and `CLOUDFLARE_ACCOUNT_ID`; the workflow `deploy-cloudflare.yml` builds and deploys on every push.

**B. Real backend (Supabase) from GitHub, no terminal**
1. Create the Supabase project (supabase.com, free). Enable nothing by hand.
2. Add the repository secrets listed at the top of `.github/workflows/supabase.yml`.
3. Actions tab → **Set up Supabase backend** → Run workflow (type your admin email after you have signed up once). It applies the schema, RLS, storage rules and cron jobs, sets the secrets, deploys the three edge functions and registers them with the database. This workflow has not been run against a real project yet.
4. In Cloudflare/Render add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and redeploy: the site switches from demo to the real backend.

The detailed manual steps follow if you prefer clicking through each dashboard.

---

# Going live: step by step (no coding needed)

You need free accounts at GitHub, Supabase, Cloudflare and Resend. Do the steps in this order.

## 1. Supabase project
1. supabase.com → **New project**. Pick the region closest to Chennai (Mumbai, `ap-south-1`, if offered). Save the database password.
2. **Project Settings → API**: copy the **Project URL** and the **anon public** key (these two go to Cloudflare later) and keep the **service_role** key private (never put it in GitHub or Cloudflare).
3. **Database → Extensions**: enable `pg_cron` and `pg_net`.
4. **SQL Editor**: open `supabase/migrations/0001_schema.sql`, paste it, **Run**. Then do the same with `0002_storage_cron.sql`.
5. **Authentication → URL Configuration**: Site URL = `https://pinboard.tcqindia.com`; add Redirect URLs `https://pinboard.tcqindia.com/organiser` and `http://localhost:5173/organiser`.
6. **Authentication → Providers → Email**: keep "Confirm email" on (organisers click a link in their email once).
7. **Google sign-in** (optional): Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* (Web). Authorised redirect URI = the callback URL shown in Supabase under Providers → Google. Paste the client ID and secret into Supabase.

## 2. Resend (email)
1. resend.com → log in with `vishnuaravinddrive1@gmail.com`.
2. **Domains → Add Domain → `tcqindia.com`**. Resend then shows DNS records (typically SPF and DKIM, plus a return-path record). Add **exactly the records Resend shows** at wherever tcqindia.com's DNS is managed, then click **Verify**. (Names and values are specific to your account, so they are not listed here.)
3. **API Keys → Create** (sending access). Copy the key; it is shown once.
4. Free plan: 100 emails/day. The send queue stays under 95/day and warns the admin at 80.

## 3. Edge functions and secrets
Install the Supabase CLI (`npm i -g supabase`), then in the repo folder:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set RESEND_API_KEY=re_xxx CRON_SECRET=$(openssl rand -hex 24) TAKEDOWN_SECRET=$(openssl rand -hex 24) \
  SITE_URL=https://pinboard.tcqindia.com FROM_EMAIL="Pin Board <pinboard@tcqindia.com>" REPLY_TO=thecuriosityquotient@gmail.com
supabase functions deploy send-emails
supabase functions deploy takedown
supabase functions deploy retention
```
Then tell the database how to call them. In the SQL Editor (use the **same** `CRON_SECRET` value you set above):
```sql
select set_edge_config('https://YOUR_PROJECT_REF.supabase.co/functions/v1', 'THE_CRON_SECRET');
```
`ADMIN_EMAIL` lives in the database Settings (admin console → Settings; default `thecuriosityquotient@gmail.com`).

## 4. Put the code on GitHub
This repo is `vishnuaravinddrive1-cpu/the-pinboard`. In **Settings → Secrets and variables → Actions** add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (for the daily keep-alive ping, so the free project never pauses).

## 5. Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick this repo.
2. Production branch **`main`**. Build settings:
   - **Root directory:** `web`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Environment variables** (Production and Preview): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the two public values from step 1; nothing else).
4. Set `NODE_VERSION` = `22` if the build asks for a newer Node.
5. Deploy. Every push to `main` redeploys; pull requests get preview URLs. Refreshing `/p/…`, `/organiser`, `/admin` works because of `web/public/_redirects`; security headers come from `web/public/_headers`.

## 6. Domain
Pages project → **Custom domains → Set up a domain** → `pinboard.tcqindia.com`. At your DNS host add a **CNAME** `pinboard` → `YOUR-PROJECT.pages.dev` (Cloudflare shows the exact target). Fallback: `thepinboard.com` (change `domain` in `web/src/config.ts`).

## 7. Your admin account
1. Open the site → `/organiser` → sign up with the email you want as admin and confirm the email.
2. In the Supabase SQL Editor:
```sql
update profiles set role = 'admin', status = 'approved' where email = 'you@example.com';
```
3. Log out and in; go to `/admin`.

## 8. Replace the logo / Terms
- Logo: replace `web/public/tcq-logo.png` (transparent PNG, dark brown). Keep the original in `docs/brand/`. A Q-only favicon can be generated if you send an SVG (icons now use the Q from the logo).
- Terms: edit `docs/terms.md`. To make everyone re-accept, bump **both** `Version:` in that file, `termsVersion` in `web/src/config.ts` and the Terms version in Admin → Settings. The operator name/address/contact are in `web/src/config.ts` (the Terms use `{{name}}`, `{{org}}`, `{{address}}`, `{{contact}}`).
- Brand colours (now taken from www.tcqindia.com: cream `#FAF3E6`, dark cream `#F2E7D3`, brown `#382525`, orange `#D58F6B`, deep orange `#A85A36`): `web/src/theme/theme.ts` and `web/tailwind.config.js` (and `:root` in `web/src/index.css`).

## 9. Optional: sample data and testing the 100 cap
After step 1, run `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed/upload-seed-images.mjs` **on your own computer**, paste `supabase/seed/seed.sql` into the SQL Editor, then `select seed_filler(90);` (110 posters: 100 live, 10 waiting). Clean up with `select seed_remove();`.

---

# How it works (short)

- **Expiry:** the public query itself filters `event_date >= today (IST)`, so an expired poster can never show. A pg_cron job at 00:00 IST (18:30 UTC) archives expired posters, promotes the queue and queues reminder emails. A database trigger also promotes the queue the moment a live poster is taken down or deleted.
- **Queue:** first-in, first-out via `queued_at`. Admin can reorder or promote.
- **Archive:** nothing is hard-deleted by organisers. After the retention period (default 3 years) a weekly job deletes image files and anonymises the records.
- **Emails:** every email goes into `email_queue`, is sent by the `send-emails` function (max 8 a minute, 95 a day, retries with back-off, all logged).
- **Analytics:** per-poster counters and daily totals only; no viewer identity or IP.
- **Security:** RLS on every table; admin is a `role` column checked in the database; the service-role key exists only in Supabase secrets; booking links must be https; uploads are re-encoded to WebP in the browser and the storage bucket accepts only `image/webp` up to 700 KB.

## Develop and test
```bash
cd web && npm ci && npm run lint && npm run typecheck && npm run build
sudo bash supabase/tests/run_local.sh          # needs postgresql-16: migrations + 75 database checks + seed/cap test
cd e2e && npm ci && python3 make-fixtures.py   # creates the upload fixtures (needs Pillow) && npx playwright test   # phone + desktop browser tests
npm --prefix ../web run check:layout           # least-visible poster per board width
```
Results and screenshots: `docs/test-report/README.md`.
