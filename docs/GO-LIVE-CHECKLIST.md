# Go-live checklist (Neon + Cloudflare + Resend)

Do A → B → C → D in order. If a step fails, send me the exact error text or a screenshot (for GitHub, the failing step's log).
Free accounts needed: GitHub (done), Neon, Cloudflare, Resend.

## A. Neon (database)
1. neon.com → sign up → **Create project**. Pick the region closest to Chennai (a Singapore region is the usual choice for India; I did not verify which regions Neon currently offers).
2. Open the project → **Connect** → copy the **connection string** (it starts with `postgresql://…` and ends with `?sslmode=require`). Keep it private: it is a password.
3. You do not need to create tables: the deploy does it.

## B. Cloudflare (website + API)
1. dash.cloudflare.com → sign up (free). On **Workers & Pages** copy your **Account ID** (right-hand side of the overview page).
2. **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → create → copy the token (shown once).
3. Your site will live at `https://pinboard.<your-subdomain>.workers.dev` (the deploy prints it). A custom address like `pinboard.tcqindia.com` works only if tcqindia.com's DNS is on Cloudflare (moving DNS to Cloudflare is free); otherwise keep the workers.dev address.

## C. Resend (email)
1. resend.com → log in. **Domains → Add Domain**. Resend recommends a sending subdomain (e.g. `send.tcqindia.com`); the app sends from `pinboard@tcqindia.com` by default. If you verify a subdomain, add the repo secret `FROM_EMAIL` with an address on it, e.g. `Pin Board <pinboard@send.tcqindia.com>`.
2. Add the DNS records Resend shows (SPF, DKIM, and an MX/CNAME) at whoever hosts tcqindia.com's DNS; omit the root domain from host names if your DNS provider appends it. If that DNS is Cloudflare, turn the proxy **off** (grey cloud) for CNAMEs. Click **Verify** (usually ~15 minutes).
3. **API Keys → Create** (sending access) → copy it.

## D. GitHub secrets and deploy
1. Repo → **Settings → Secrets and variables → Actions → New repository secret**. Create:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` (Neon string), `RESEND_API_KEY`,
   `TAKEDOWN_SECRET` (type 40+ random characters), `BOOTSTRAP_ADMIN_EMAIL` (**your own email**; the first person who signs in with it becomes the admin).
2. **Actions → "Deploy Pin Board (database + Cloudflare)" → Run workflow** (tick *Load sample data* if you want 20 sample posters to look at; remove them later in Neon's SQL editor with `select seed_remove();`).
3. When it is green, open the run's summary for the address. Add that address as the secret `SITE_URL` and run the workflow once more (emails and Google sign-in use it).
4. Optional Google login: Google Cloud Console → Credentials → OAuth client (Web) → authorised redirect URI `<SITE_URL>/api/auth/google/callback` → add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets → run the workflow again.

## E. Smoke test (about 10 minutes)
1. Open the site. The board should be empty (or show the 20 sample posters). `/terms` shows your Terms.
2. Go to `/organiser` → **Sign up** with your `BOOTSTRAP_ADMIN_EMAIL`, tick the Terms → you should receive an email with a 6-digit code (check spam) → enter it. You land on "My posters" with an **Admin** button: you are the admin.
3. Open a private window → sign up as a second person (another email) → "Pending approval". In `/admin → Organisers` approve it; that person gets an email and can now upload.
4. Upload a poster (leave the booking link empty). It appears on the board at once. Press **Report** on it as a visitor, then see it under `/admin → Reports`.
5. `/admin → Emails` shows every email as sent / queued / failed with the error text if any. The admin email "New poster" has a **One-click take-down** link: it shows a confirmation page first.
6. Cron check: Cloudflare dashboard → Workers & Pages → pinboard → **Settings → Triggers**: two cron schedules should be listed (`30 18 * * *` and `0 * * * *`).

## F. Real phones
Use the live address on at least one iPhone and one Android, ideally on mobile data too.
**Viewer:** [ ] board scrolls smoothly, no sideways scroll; [ ] tap a poster to enlarge, tap the dark cork outside to close; [ ] pinch to zoom, swipe down to close; [ ] back gesture closes the poster and does not leave the site; [ ] double-tap books in a new tab, a poster with no link shows "No booking link for this event."; [ ] Share opens the share sheet, Google Calendar and .ics work; [ ] notch/home-bar areas are not covered (also sideways).
**Organiser:** [ ] code arrives and the code box auto-fills or is easy to type; typing in fields does not zoom the page (iPhone); [ ] Take photo opens the camera; gallery and file pickers work, also a PDF; [ ] with flight mode on just before Post you get a clear error and a working Try again; [ ] Add to Home Screen opens full-screen with the TCQ Q icon.
**Admin:** [ ] posters appear as stacked cards, buttons are easy to tap, "Search and filters" opens.
**Speed (optional):** on mobile data the first poster should show within a few seconds; scrolling should feel smooth. Note phone model if it stutters.

## What I could not test (so please watch for it)
- Talking to a real **Neon** database (tests use a normal local Postgres; the Neon driver was only checked to start an HTTPS request) and real **Cloudflare** deploys. The Worker itself was run locally under Cloudflare's own runtime (workerd) for routing, headers and the single-page-app fallback.
- Real **Resend** delivery and Google sign-in.
- **Free-plan CPU limit:** Cloudflare Free allows about 10 ms of CPU per request. Waiting for the database does not count, but I could not measure the Worker's real CPU use. If you see "Error 1102 / exceeded resource limits", that is this; the fix is Cloudflare's $5/month plan or telling me to slim the hot paths.
