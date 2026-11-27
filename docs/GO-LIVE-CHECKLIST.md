# Go-live checklist (Neon + Cloudflare, no email service)

This puts Pin Board on a **temporary workers.dev address** first; moving to pinboard.tcqindia.com later is in `docs/MOVE-TO-TCQ-DOMAIN.md`.
Do A → B → C in order. If a step fails, send me the exact error text or a screenshot (for GitHub, the failing step's log).
Free accounts needed: GitHub (done), Neon, Cloudflare. **No email service**: you will send the few emails by hand (`docs/EMAILS.md`).

## A. Neon (database)
1. neon.com → sign up → **Create project**. Pick the region closest to Chennai (a Singapore region is the usual choice for India; I did not verify which regions Neon currently offers).
2. Open the project → **Connect** → copy the **connection string** (starts with `postgresql://…`, ends with `?sslmode=require`). Keep it private: it is a password.
3. You do not need to create tables: the deploy does it.

## B. Cloudflare (website + API)
1. dash.cloudflare.com → sign up (free). On **Workers & Pages** copy your **Account ID**.
2. **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → create → copy the token (shown once).
3. Your site will live at `https://pinboard.<your-subdomain>.workers.dev` (the deploy prints it).

## C. GitHub secrets and deploy
1. Repo → **Settings → Secrets and variables → Actions → New repository secret**. Create:
   - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - `DATABASE_URL` (the Neon string)
   - `ADMIN_SETUP_KEY`: type 40+ random characters (letters and numbers). Write it down; you use it once.
   - `BOOTSTRAP_ADMIN_EMAIL`: **your own email address** (the admin account is created for it)
2. **Actions → "Deploy Pin Board (database + Cloudflare)" → Run workflow** (tick *Load sample data* if you want 20 sample posters to look at; remove them later in Neon's SQL editor with `select seed_remove();`).
3. When it is green, open the run's summary for the address. Add that address as the secret `SITE_URL` and run the workflow once more (the sign-in links in your emails use it).
4. Optional: **Google sign-in** (instant login without a link; most organisers have a Google account). Google Cloud Console → Credentials → OAuth client (Web) → authorised redirect URI `<SITE_URL>/api/auth/google/callback` → add secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → run the workflow again.

## D. Become the admin (once)
Open `https://<your address>/organiser?setup=<your ADMIN_SETUP_KEY>`. You are signed in as the admin and shown **your personal sign-in link**: copy it and keep it (bookmark it on your phone and computer). That link is how you sign in from now on. The set-up page stops working once an admin exists (you can delete the `ADMIN_SETUP_KEY` secret afterwards). If you lose your link: Admin → **My sign-in link** (while signed in), or ask me for a recovery step.

## E. Smoke test (about 10 minutes)
1. The public board is empty (or shows 20 sample posters). `/terms` shows your Terms.
2. Open a private window → `/organiser` → **Request access** with a second email of yours, tick the Terms. You see "Thank you". You are **not** logged in.
3. As admin: Dashboard shows "Needs your attention: 1 organiser waiting for approval". Organisers tab → **Approve**.
4. **Outbox** tab: an email to that address is ready ("You are approved…") with the sign-in link inside. Press **Open in my email app**, send it from thecuriosityquotient@gmail.com, then **Mark as sent**.
5. In the private window open the link from that email: you land on "My posters", signed in. Upload a poster (leave the booking link empty): it appears on the board at once.
6. Visitor test: open the board in another window, press **Report** on the poster; see it under Admin → **Reports**.
7. Cron check: Cloudflare dashboard → Workers & Pages → pinboard → **Settings → Triggers**: one cron schedule `30 18 * * *`.

## F. Real phones
Use the live address on at least one iPhone and one Android, ideally on mobile data too.
**Viewer:** [ ] board scrolls smoothly, no sideways scroll; [ ] tap a poster to enlarge, tap the dark cork outside to close; [ ] pinch to zoom, swipe down to close; [ ] back gesture closes the poster and does not leave the site; [ ] double-tap books in a new tab, a poster with no link shows "No booking link for this event."; [ ] Share opens the share sheet, Google Calendar and .ics work; [ ] notch/home-bar areas are not covered (also sideways).
**Organiser:** [ ] opening the emailed link on the phone signs in; [ ] typing in fields does not zoom the page (iPhone); [ ] Take photo opens the camera; gallery and file pickers work, also a PDF; [ ] with flight mode on just before Post you get a clear error and a working Try again; [ ] Add to Home Screen opens full-screen with the TCQ Q icon.
**Admin:** [ ] on your phone the Outbox's **Open in my email app** opens your mail app with To, Subject and message filled in; [ ] posters appear as stacked cards, buttons are easy to tap, "Search and filters" opens.
**Speed (optional):** on mobile data the first poster should show within a few seconds; scrolling should feel smooth. Note the phone model if it stutters.

## What I could not test (so please watch for it)
- Talking to a real **Neon** database (tests use a normal local Postgres; the Neon driver was only checked to start an HTTPS request) and real **Cloudflare** deploys. The Worker itself was run locally under Cloudflare's own runtime (workerd) for routing, headers and the single-page-app fallback.
- Google sign-in, and the `mailto:` button on real phones and mail apps.
- **Free-plan CPU limit:** Cloudflare Free allows about 10 ms of CPU per request. Waiting for the database does not count, but I could not measure the Worker's real CPU use. If you see "Error 1102 / exceeded resource limits", that is this; the fix is Cloudflare's $5/month plan or telling me to slim the hot paths.
