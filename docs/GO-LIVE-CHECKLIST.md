# Go-live checklist: the three things not yet tested for real

Do them in this order: **A** (Supabase) → **B** (Resend) → **C** (phones). Tick as you go. If anything fails, copy the exact error text or take a screenshot and send it back; each step says what "success" looks like.

You will need: the GitHub repo (public now), and free accounts at Supabase, Cloudflare (website hosting) and Resend.

---

## A. Create the real Supabase project

1. **Create the project.** supabase.com → sign in with GitHub → **New project**. Pick the region closest to Chennai (Mumbai if offered). Set a database password and **save it somewhere safe** (a password manager). Wait until the project finishes starting.
2. **Collect four values** (keep them in a private note, not in GitHub):
   - **Project ref**: the short id in the project URL (`https://supabase.com/dashboard/project/<ref>`), also the first part of `https://<ref>.supabase.co`.
   - **Project URL** and **anon (public) key**: *Project Settings → API*. (Never use or share the `service_role` key.)
   - **Access token**: supabase.com/dashboard/account/tokens → generate a token.
   - **Session-pooler database URL**: click **Connect** at the top of the project → choose **Session pooler** → copy the string and replace the password placeholder with your database password. If the password contains characters like `& # ? @` or a space, URL-encode them (or pick a simpler password).
3. **Add GitHub secrets.** Repo → *Settings → Secrets and variables → Actions → New repository secret*. Create exactly these names:
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `SITE_URL` (your site address, e.g. `https://pinboard.tcqindia.com`, or the temporary `https://pinboard.pages.dev` address from part C), `CRON_SECRET` and `TAKEDOWN_SECRET` (each: any long random string, 40+ characters; make two different ones), and `RESEND_API_KEY` (from part B; you can add it after B and re-run the workflow).
4. **Sign-in settings** (Supabase → *Authentication*): *URL Configuration* → Site URL = your site address; add Redirect URLs `<your site>/organiser` and `http://localhost:5173/organiser`. Under *Sign In / Providers → Email* keep **Confirm email** on. Google login is optional: create an OAuth client in Google Cloud Console and paste its ID/secret into *Providers → Google* (use the callback URL Supabase shows).
5. **Run the setup.** GitHub → *Actions → "Set up Supabase backend" → Run workflow*. Leave the admin email empty for now.
   - Success = every step green. This is the first real run of that workflow, so a failure here is plausible: open the red step, copy its last 20 lines, and send them to me.
6. **Put the website on Cloudflare Pages** (needed to use the real backend): Cloudflare → *Workers & Pages → Create → Pages → Connect to Git* → this repo. Root directory `web`, build command `npm run build`, output directory `dist`. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the Project URL and anon key from step 2), then deploy. Set the production branch to the repo's default branch (currently `claude/lucid-lamport-j3x023`) or merge it into `main` first.
7. **Create your admin account.** Open the live site → `/organiser` → *Sign up* with your own email, tick the Terms, confirm the email link, log in (you will see "Pending approval"). Then GitHub → Actions → *Set up Supabase backend* → Run workflow, type that email in **make_admin_email**, run. Open `/admin`: you should see the dashboard.
8. **Smoke test.** Sign up a second test account (a different email) → in `/admin → Organisers` approve it → log in as it → upload a poster (leave the booking link empty) → it should appear on the main board at once. In Supabase → *Table Editor → posters* you will see the row; *Storage → posters* holds the image.
   - Cron check: *SQL Editor* → `select jobname, schedule from cron.job;` should list three jobs (`pinboard-nightly`, `pinboard-send-emails`, `pinboard-retention`).

## B. Resend delivery

1. **Account.** resend.com → log in (the account registered to `vishnuaravinddrive1@gmail.com`).
2. **Add the domain.** *Domains → Add Domain*. Resend recommends a sending subdomain (e.g. `send.tcqindia.com` or `mail.tcqindia.com`) rather than the bare domain. Pin Board is set to send from `pinboard@tcqindia.com`; if you verify a subdomain instead, tell me and I will change `FROM_EMAIL`, or edit it in the workflow file.
3. **Add the DNS records.** Resend shows a *Records* table (SPF and DKIM TXT records plus an MX or CNAME). Add exactly those at whoever hosts DNS for tcqindia.com; copy-paste, and omit the root domain from the host field if your DNS provider appends it. If that DNS is Cloudflare, switch **proxying off** (grey cloud) for any CNAME. Click **Verify**; it usually takes up to ~15 minutes, sometimes longer. Success = status **Verified**.
4. **API key.** *API Keys → Create API Key* (sending access) → copy it once → save as the GitHub secret `RESEND_API_KEY` → re-run *Set up Supabase backend* so the key reaches the functions.
5. **Delivery test.**
   - Sign up a new organiser on the live site. Within about a minute **thecuriosityquotient@gmail.com** should receive "New organiser awaiting approval" (check spam too).
   - Approve that organiser in `/admin`; the organiser's inbox should receive "You are approved".
   - Upload a poster; you should get "New poster" with a **One-click take-down** link, and the organiser gets "Your poster is live". Click the take-down link: it shows a confirmation page, press the red button, and the poster disappears from the board.
   - Replying to any email should go to thecuriosityquotient@gmail.com.
6. **If nothing arrives:** *Admin → Emails* shows each email as sent / queued / failed with the error text; Resend → *Logs* shows what Resend received. Send me the error. One thing to double-check: the code sends the reply-to address in a field called `reply_to`; I confirmed Resend's idempotency header but not that field name, so the error text (if any) will tell us.
7. **Limits to know.** The free plan allows 100 emails/day; the app caps itself at 95 and warns you at 80 on the admin dashboard.

## C. Real phones

You need the **live address** from A6 (a `*.pages.dev` address is fine) and at least one iPhone and one Android phone, ideally on mobile data (4G) as well as Wi-Fi.

Test on each phone (note anything odd, plus phone model and browser):

**Viewer (no login)**
- [ ] Board loads, scrolls smoothly, no sideways scrolling, logo top right opens tcqindia.com in a new tab.
- [ ] **Tap** a poster: it enlarges with title, date and buttons. Tap the dark cork outside it: closes.
- [ ] **Pinch** the enlarged poster: zooms and pans. **Swipe down** (when not zoomed): closes.
- [ ] **Back gesture/button** closes the poster and does not leave the site; the board stays where you were.
- [ ] **Double-tap** a poster with a booking link: the link opens in a new tab and the poster does not flicker open/closed. A poster **without** a link shows "No booking link for this event."
- [ ] **Share** opens the phone's share sheet; **Google Calendar** opens; **.ics** downloads and opens in your calendar app.
- [ ] First-visit hint shows once and stays dismissed after "Got it".
- [ ] Notch/home-bar areas are not covered by buttons (turn the phone sideways too).

**Organiser**
- [ ] Sign up and log in with one hand; typing in a field does **not** zoom the page (iPhone).
- [ ] **Take photo** opens the camera; **Choose from gallery** and **Choose file** work. Try a photo straight from the camera, a screenshot, and a **PDF** (it should say "first page of your PDF").
- [ ] Date picker is the phone's native one; submit is easy to hit; the preview shows the poster on dark cork.
- [ ] Switch to flight mode just before pressing Post: you should get a clear error and a **Try again** button that works once you are back online.
- [ ] Add to Home screen (Safari: Share → *Add to Home Screen*; Chrome: menu → *Install app / Add to Home screen*): opens full-screen with the TCQ Q icon.

**Admin**
- [ ] Posters list is readable as stacked cards; Take down / Approve buttons are easy to tap; "Search and filters" opens.

**Speed (optional):** on mobile data, the first poster should be visible within a few seconds, and scrolling should feel smooth. If it stutters, note the phone model.

---

### When you report back
Send me: which steps passed, and for any failure the exact message or a screenshot (for the Actions workflow, the failing step's log; for phones, the model, browser and what you did). I will fix what breaks and re-run the automated tests.
