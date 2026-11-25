# Test report

Run on 25 Nov 2026 in a Linux container: Chromium (Playwright) emulating **iPhone 14**, **Pixel 7** and a **1280×800 desktop**; PostgreSQL 16 for the database; Lighthouse 12 (mobile preset).
Browser tests run against the production build in **demo mode** (data in the browser). The database is tested separately on plain Postgres with a small Supabase stand-in.

| Suite | Result |
|---|---|
| Browser tests (viewer, organiser, admin, layouts, fonts) × 3 devices | **127 passed, 8 skipped** (skips = hover/keyboard tests on touch devices, phone-only tests on desktop) |
| Database tests (`supabase/tests/tests.sql`) | **75 checks passed** |
| 100-cap with real default limit (seed 20 + `seed_filler(90)`) | 100 live, rest waiting, public view returns exactly 100 |
| Lighthouse mobile (home page, built site) | Performance **95**, Accessibility **100**, Best practices **100**, SEO **100**; CLS 0, TBT 30 ms |
| Poster visibility (100 mixed-ratio posters, 7 widths) | least-visible poster still **69–85 %** visible |

## Your checklist (item 5)

| Item | How it was tested | Result |
|---|---|---|
| **Midnight IST expiry** | Browser: clock set to 23:59:50 IST, poster (event date that day) is on the board; clock set to 00:00:10 IST, it is gone. Database: 18:29:59 UTC = still the 10th, 18:30:00 UTC = the 11th; an expired row still marked `live` is hidden by the public query; the nightly job marks it expired and archives a waiting poster that missed its date; nothing is hard-deleted | Pass |
| **100-cap and queue promotion** | Database (limit lowered to 3): 3 live, next two get queue positions 1 and 2, public sees only 3, a take-down promotes the first waiting poster immediately (trigger), an organiser delete promotes the next, promotion emails queued. Seed test at the real limit of 100. Browser: organiser upload to a full board shows the exact queue message and position; admin reorder, promote (refused while full), take-down promotes at once | Pass |
| **Role access and RLS** | Database: anonymous cannot read posters/profiles/email queue/analytics or create posters; pending and suspended organisers cannot post; organisers cannot approve themselves, change status/views/clicks, read the log, call admin functions, edit another organiser's poster or reference another organiser's files; storage rules per folder; Terms re-acceptance blocks uploads. Browser: an organiser opening `/admin` gets "Admins only" | Pass |
| **Email triggers** | Database: rows land in `email_queue` for new organiser, new poster, approval, suspension, waiting, promoted, out-of-scope, report, reminder (once only). **Not tested:** actual delivery through Resend (see below) | Queueing pass; delivery untested |
| **PDF and large image uploads** | Browser: a PDF (first page → image, under 400 KB), a 9.5 MB JPEG (compressed to under 400 KB, long edge ≤ 1600 px), a text file renamed `.png` (rejected by content) | Pass |
| **Poster interactions** | Hover raise with 80 ms intent and release; quick sweep does not flicker; scrolling under a still pointer raises the new poster; click/tap enlarges (title, date, buttons); double-click/double-tap books in a new tab without toggling the view; poster with no booking link shows "No booking link for this event." and has no Book button; Esc closes with scroll position and focus restored; back button closes without leaving the site; Close button; tap on cork; deep link `/p/{id}`; unknown id falls back; Tab/Enter/arrow keys; view and click counting | Pass |
| **Outfit everywhere** | Every visible element on the board, enlarged view, organiser, admin, Terms and Privacy has computed font Outfit; weights 400/600/700 loaded; no request to Google Fonts (self-hosted, preloaded) | Pass |
| **Phone and desktop layouts** | 360, 390, 430, 768, 1024, 1280, 1536 px: no horizontal scroll on viewer, enlarged view, organiser list/upload, admin dashboard/posters/organisers; admin action buttons ≥ 44 px on phones; inputs ≥ 16 px | Pass. Screenshots below |

## Screenshots
`docs/test-report/{viewer-board,viewer-enlarged,organiser-list,organiser-upload,admin-dashboard,admin-posters}-{360,390,430,768,1024,1280,1536}.png`

## Not tested here (be aware)
- **A live Supabase project**: Auth (email confirmation, Google), the Storage bucket in the real service, `pg_cron`/`pg_net`, and the three **Edge Functions** (Deno code, not type-checked or run here; Deno was not available). The browser Supabase client (`web/src/lib/supabaseBackend.ts`) is type-checked but has not talked to a real project. Expect a short fix-up pass on first deployment.
- **Resend delivery.** Template rendering, the `reply_to` field name and the throttling are written from Resend's documentation; confirm with one real test email.
- **Real iPhone Safari / Android devices.** Emulation in Chromium only; pinch-to-zoom and swipe-down are implemented with pointer events but were not exercised on a real touchscreen. Check on your own phone.
- **60 fps on a mid-range Android on 4G**: off-screen posters are not rendered and animations use transform/opacity only, but this was not measured on a device.
