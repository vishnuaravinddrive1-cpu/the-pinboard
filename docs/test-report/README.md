# Test report

Run on 25 Nov 2026 in a Linux container: Chromium (Playwright) emulating **iPhone 14**, **Pixel 7** and a **1280×800 desktop**; PostgreSQL 16 for the database; Lighthouse 12 (mobile preset).
Browser tests run against the production build in **demo mode** (data in the browser). The database is tested separately on plain Postgres.

| Suite | Result |
|---|---|
| Database tests (`db/tests/tests.sql`): RLS, roles, cap, queue, expiry, reminders, outbox, analytics, retention | **77 checks passed** |
| 100-cap with the real default limit (seed 20 + 90 filler) | 100 live, rest waiting, public view returns exactly 100 |
| API tests (`api/test`): request access, admin set-up, personal sign-in links, sessions, CSRF, roles, uploads, queue, outbox emails, Terms | **28 passed**, on a real Postgres |
| Browser tests, demo mode (viewer, organiser, admin, layouts, fonts) × iPhone-, Pixel-sized, desktop | **139 passed, 8 skipped** (hover/keyboard on touch, phone-only checks on desktop) |
| Browser tests, **full stack** (real API + Postgres, no demo data) | **8 passed on desktop, 8 on Pixel-sized** |
| Worker under Cloudflare's runtime (workerd, `wrangler dev`) | single-page fallback, `/api` and `/img` routed to the Worker, security headers, CSRF verified |
| Lighthouse mobile (built site) | Performance **94**, Accessibility **100**, Best practices **100**, SEO **100**; CLS 0 |
| Poster visibility (100 mixed-ratio posters, 7 widths) | least-visible poster still **69–85 %** visible |

Pin Board has no email service: emails are written for the admin to send by hand (`docs/EMAILS.md`).

Browser tests ran in Chromium emulating iPhone 14, Pixel 7 and a 1280×800 desktop.

## Your checklist (item 5)

| Item | How it was tested | Result |
|---|---|---|
| **Midnight IST expiry** | Browser: clock set to 23:59:50 IST, poster (event date that day) is on the board; clock set to 00:00:10 IST, it is gone. Database: 18:29:59 UTC = still the 10th, 18:30:00 UTC = the 11th; an expired row still marked `live` is hidden by the public query; the nightly job marks it expired and archives a waiting poster that missed its date; nothing is hard-deleted | Pass |
| **100-cap and queue promotion** | Database (limit lowered to 3): 3 live, next two get queue positions 1 and 2, public sees only 3, a take-down promotes the first waiting poster immediately (trigger), an organiser delete promotes the next, promotion emails queued. Seed test at the real limit of 100. Browser: organiser upload to a full board shows the exact queue message and position; admin reorder, promote (refused while full), take-down promotes at once | Pass |
| **Role access and RLS** | Database and API: anonymous cannot read posters/profiles/email queue/analytics or create posters; pending and suspended organisers cannot post; organisers cannot approve themselves, change status/views/clicks, read the log, call admin functions, edit another organiser's poster or reference another organiser's files; storage rules per folder; Terms re-acceptance blocks uploads. Browser: an organiser opening `/admin` gets "Admins only" | Pass |
| **Emails (sent by hand)** | Database and API: each event that needs an email writes one ready-to-send message into the Outbox with the right recipient, subject and plain-text body (approval + personal sign-in link, rejection, suspension, new link, poster promoted from the queue, reminder once per poster, out of scope); nothing is queued for things the organiser sees on screen. Browser: Outbox lists, the `mailto:` link carries subject and body, mark as sent / skip / put back, dashboard counter follows | Pass. The `mailto:` button was not tried on real phones |
| **PDF and large image uploads** | Browser: a PDF (first page → image, under 400 KB), a 9.5 MB JPEG (compressed to under 400 KB, long edge ≤ 1600 px), a text file renamed `.png` (rejected by content) | Pass |
| **Poster interactions** | Hover raise with 80 ms intent and release; quick sweep does not flicker; scrolling under a still pointer raises the new poster; click/tap enlarges (title, date, buttons); double-click/double-tap books in a new tab without toggling the view; poster with no booking link shows "No booking link for this event." and has no Book button; Esc closes with scroll position and focus restored; back button closes without leaving the site; Close button; tap on cork; deep link `/p/{id}`; unknown id falls back; Tab/Enter/arrow keys; view and click counting | Pass |
| **Outfit everywhere** | Every visible element on the board, enlarged view, organiser, admin, Terms and Privacy has computed font Outfit; weights 400/600/700 loaded; no request to Google Fonts (self-hosted, preloaded) | Pass |
| **Phone and desktop layouts** | 360, 390, 430, 768, 1024, 1280, 1536 px: no horizontal scroll on viewer, enlarged view, organiser list/upload, admin dashboard/posters/organisers; admin action buttons ≥ 44 px on phones; inputs ≥ 16 px | Pass. Screenshots below |

## Screenshots
`docs/test-report/{viewer-board,viewer-enlarged,organiser-list,organiser-upload,admin-dashboard,admin-posters}-{360,390,430,768,1024,1280,1536}.png`

## Not tested here (be aware)
- **A real Neon database and real Cloudflare deploys.** Everything runs on a local Postgres 16 through the same SQL; the Neon HTTP driver was only checked to start. Expect a short fix-up pass on first deployment.
- **Cloudflare free-plan CPU limit (10 ms/request)**: not measured.
- **Google sign-in** and the `mailto:` "Open in my email app" button on real phones and mail apps.
- **Real iPhone Safari / Android devices.** Emulation in Chromium only; pinch-to-zoom and swipe-down are implemented with pointer events but were not exercised on a real touchscreen. Check on your own phone.
- **60 fps on a mid-range Android on 4G**: off-screen posters are not rendered and animations use transform/opacity only, but this was not measured on a device.
