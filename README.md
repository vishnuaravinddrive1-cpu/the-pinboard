# Pin Board

A free digital community notice board for Chennai, run by **The Curiosity Quotient (TCQ)**.
Organisers post event posters; they stay on a dark cork board until the event day ends.

- **Viewer** (`/`): full-screen cork board, no login. Hover/click/double-click posters, share, add to calendar.
- **Organiser** (`/organiser`): sign up (emailed code, or Google), get approved, upload posters (JPG/PNG/WebP/PDF).
- **Admin** (`/admin`): approve organisers, take down / restore / extend posters, queue, stats, logs, CSV export, settings.

**Stack (all free tiers):** Vite + React + TypeScript + Tailwind website · one **Cloudflare Worker** (website files + API + scheduled jobs) · **Neon** Postgres (data, and poster images by default) · **Resend** for email · **GitHub Actions** deploys it.
No server to run. Supabase is not used.

```
web/    the website (Vite + React) -> web/dist
api/    the Cloudflare Worker (Hono): sign-in, uploads, queue, emails, cron  (+ test server and tests)
db/     migrations/ (Postgres schema, Row Level Security, queue logic), seed/, tests/
e2e/    Playwright browser tests (demo mode + full stack)
docs/   terms.md, privacy.md, GO-LIVE-CHECKLIST.md, test-report/
wrangler.toml   Cloudflare Worker settings (cron times, static files, routing)
.github/workflows/   CI and the one-click deploy
```

## See it now (no accounts)
```bash
cd web && npm install && npm run dev
```
Without the API, the site runs in **demo mode**: 22 sample posters, and upload / approval / queue / admin all work inside your own browser. Demo sign-in code is `123456`; demo accounts: `organiser@demo.test`, `newbie@demo.test` (pending), `suspended@demo.test`, `admin@demo.test`.
On the live site the browser asks `/api/config`; if the API answers it is used, otherwise demo mode. A network error never falls back to fake data.

## Put it on the web (step by step: **docs/GO-LIVE-CHECKLIST.md**)
Start on the free temporary `workers.dev` address (hidden from search engines); move to `pinboard.tcqindia.com` later with **docs/MOVE-TO-TCQ-DOMAIN.md**.
1. **Neon**: create a free project, copy its connection string.
2. **Cloudflare**: copy your Account ID, create an API token (template *Edit Cloudflare Workers*).
3. **Resend**: verify `tcqindia.com`, create an API key.
4. **GitHub**: add the secrets (list below) to this repo → *Actions → Deploy Pin Board → Run workflow*.
   It builds the site, creates the database tables, deploys the Worker (site + API + cron) and sets its secrets.
5. Open the address it prints. Sign up on `/organiser` with your `BOOTSTRAP_ADMIN_EMAIL`: you become the admin automatically.

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | deploy to Cloudflare |
| `DATABASE_URL` | Neon connection string |
| `RESEND_API_KEY` | sending email |
| `TAKEDOWN_SECRET` | any long random string (signs the one-click take-down links) |
| `BOOTSTRAP_ADMIN_EMAIL` | your email: the first sign-in with it becomes the admin |
| `SITE_URL` *(optional at first)* | your public address, e.g. `https://pinboard.tcqindia.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` *(optional)* | "Continue with Google" |

## How it works
- **Sign-in:** passwordless. An emailed 6-digit code (10 minutes, 5 tries) or Google. Sessions are a random token in an HttpOnly cookie (only its hash is stored). Free Cloudflare Workers allow about 10 ms of CPU per request, too little for safe password hashing, which is why there are no passwords.
- **Security:** the browser never talks to the database. For every request the Worker runs ONE transaction that switches to a restricted database role and sets the user's id, so Postgres **Row Level Security** applies exactly as before (organisers touch only their own posters; admin is a `role` column checked in the database; anonymous visitors read only live posters). Uploads are re-encoded to WebP in the browser and the server re-checks content type (WebP signature) and size (700 KB). All POSTs must carry our own `Origin` (CSRF). Booking links must be https.
- **Expiry:** the public query itself filters `event_date >= today (IST)`; a nightly Cloudflare cron at 00:00 IST (18:30 UTC) archives expired posters, promotes the queue, queues reminders and runs retention; a database trigger also promotes the queue the moment a live poster is taken down or deleted.
- **Queue:** first-in, first-out. Admin can reorder or promote.
- **Archive:** posters are never hard-deleted by organisers. After the retention period (default 3 years) image files are deleted and records anonymised.
- **Emails:** every email goes into a queue table and is sent through Resend right after the action (and hourly retries), max 95 a day with a warning at 80, retries with back-off, all logged in the admin console.
- **Images:** stored in Neon by default (no extra account). Optional switch to Cloudflare R2: see `wrangler.toml`.
- **Analytics:** per-poster counters and daily totals only; no viewer identity or IP.

## Free-tier limits to know
Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU/request, 5 cron triggers (we use 2). Neon Free: 1 GB per project, limited compute hours (the database sleeps when idle and wakes on the next request, which can add about a second to the first visit after quiet periods). Resend Free: 100 emails/day (each sign-in code is one email).

## Develop and test
```bash
cd web && npm ci && npm run lint && npm run typecheck && npm run build
cd ../api && npm ci && npm run typecheck
sudo bash db/tests/run_local.sh          # needs postgresql-16: schema + 72 database checks + seed/100-cap test
sudo bash api/test/run.sh                # 24 API tests on a real Postgres (fake Resend)
cd e2e && npm ci && python3 make-fixtures.py
npx playwright test                                         # demo mode, phone + desktop
npx playwright test -c playwright.fullstack.config.ts       # real API + Postgres (run per --project)
npm --prefix ../web run check:layout                        # least-visible poster per board width
```
Results and screenshots: `docs/test-report/README.md`.
