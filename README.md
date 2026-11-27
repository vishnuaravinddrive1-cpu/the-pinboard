# Pin Board

A free digital community notice board for Chennai, run by **The Curiosity Quotient (TCQ)**.
Organisers post event posters; they stay on a dark cork board until the event day ends.

- **Viewer** (`/`): full-screen cork board, no login. Hover/click/double-click posters, share, add to calendar.
- **Organiser** (`/organiser`): request access, get approved, sign in with a personal link (or Google), upload posters (JPG/PNG/WebP/PDF).
- **Admin** (`/admin`): approve organisers, take down / restore / extend posters, queue, stats, logs, CSV export, settings, and the **Outbox** of emails to send.

**Stack (all free tiers):** Vite + React + TypeScript + Tailwind website · one **Cloudflare Worker** (website files + API + scheduled job) · **Neon** Postgres (data, and poster images by default) · **GitHub Actions** deploys it.
No server to run and **no email service**: the few emails Pin Board needs are written for you in **Admin → Outbox** and you send them by hand (see `docs/EMAILS.md`).

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
Without the API, the site runs in **demo mode**: 22 sample posters, and upload / approval / queue / admin all work inside your own browser. Demo mode shows one-click demo accounts on the sign-in page: `organiser@demo.test`, `newbie@demo.test` (pending), `suspended@demo.test`, `admin@demo.test`.
On the live site the browser asks `/api/config`; if the API answers it is used, otherwise demo mode. A network error never falls back to fake data.

## Put it on the web (step by step: **docs/GO-LIVE-CHECKLIST.md**)
Start on the free temporary `workers.dev` address (hidden from search engines); move to `pinboard.tcqindia.com` later with **docs/MOVE-TO-TCQ-DOMAIN.md**.
1. **Neon**: create a free project, copy its connection string.
2. **Cloudflare**: copy your Account ID, create an API token (template *Edit Cloudflare Workers*).
3. **GitHub**: add the secrets (list below) → *Actions → Deploy Pin Board → Run workflow*. It builds the site, creates the database tables, deploys the Worker and sets its secrets.
4. Open the address it prints, then once: `https://<address>/organiser?setup=<your ADMIN_SETUP_KEY>`. You become the admin and are shown your personal sign-in link: save it.

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | deploy to Cloudflare |
| `DATABASE_URL` | Neon connection string |
| `ADMIN_SETUP_KEY` | any long random string (40+ characters); opens the one-time admin set-up page |
| `BOOTSTRAP_ADMIN_EMAIL` | your email: the admin account is created for it |
| `SITE_URL` *(optional at first)* | your public address, e.g. `https://pinboard.tcqindia.com` (used inside sign-in links) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` *(optional)* | "Continue with Google" (instant sign-in, no link needed) |

## How it works
- **No automatic email.** Things that need an email (approval, rejection, suspension, a new sign-in link, "your poster moved off the queue", event reminders, "poster taken down") appear in **Admin → Outbox**: To, Subject and the full message are written. Press *Open in my email app* (or copy), send, press *Mark as sent*. Everything else (new organiser, new poster, report) shows in the admin console instead, and organisers see "live" / "in the queue" on screen right after posting.
- **Sign-in:** no passwords. A new organiser *requests access* (name, email, Terms). The admin approves, which writes an email containing that organiser's **personal sign-in link**. Opening the link signs them in (cookie, about a month); it works on any device and expires after a year; each person keeps their 5 newest links. "Lost your link?" puts a new one in the Outbox. Google sign-in is optional. Only a hash of every link/session token is stored.
- **Security:** the browser never talks to the database. For every request the Worker runs ONE transaction that switches to a restricted database role and sets the user's id, so Postgres **Row Level Security** applies (organisers touch only their own posters; admin is a `role` column checked in the database; anonymous visitors read only live posters). Uploads are re-encoded to WebP in the browser and the server re-checks the WebP signature and size (700 KB). All POSTs must carry our own `Origin` (CSRF). Booking links must be https.
- **Expiry:** the public query itself filters `event_date >= today (IST)`; a nightly Cloudflare cron at 00:00 IST (18:30 UTC) archives expired posters, promotes the queue, queues reminders and runs retention; a database trigger also promotes the queue the moment a live poster is taken down or deleted.
- **Queue:** first-in, first-out. Admin can reorder or promote.
- **Archive:** posters are never hard-deleted by organisers. After the retention period (default 3 years) image files are deleted and records anonymised.
- **Images:** stored in Neon by default (no extra account). Optional switch to Cloudflare R2: see `wrangler.toml`.
- **Analytics:** per-poster counters and daily totals only; no viewer identity or IP.

## Free-tier limits to know
Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU/request, 5 cron triggers (we use 1). Neon Free: 1 GB per project, limited compute hours (the database sleeps when idle and wakes on the next request, which can add about a second to the first visit after quiet periods).

## Develop and test
```bash
cd web && npm ci && npm run lint && npm run typecheck && npm run build
cd ../api && npm ci && npm run typecheck
sudo bash db/tests/run_local.sh          # needs postgresql-16: schema + database checks + seed/100-cap test
sudo bash api/test/run.sh                # API tests on a real Postgres
(cd api && npm run emails:doc)           # regenerates docs/EMAILS.md from the email templates
cd e2e && npm ci && python3 make-fixtures.py
npx playwright test                                         # demo mode, phone + desktop
npx playwright test -c playwright.fullstack.config.ts       # real API + Postgres (run per --project)
npm --prefix ../web run check:layout                        # least-visible poster per board width
```
Results and screenshots: `docs/test-report/README.md`.
