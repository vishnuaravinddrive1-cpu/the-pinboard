# Starting on a temporary address, moving to pinboard.tcqindia.com later

## Now: the temporary ("dummy") address
Follow `docs/GO-LIVE-CHECKLIST.md` sections A to E. Your site will be `https://pinboard.<your-cloudflare-subdomain>.workers.dev`.
- Search engines are told **not** to index any `*.workers.dev` page, so the dummy site stays out of Google.
- Use it for real testing: sign-ups, uploads, emails, phones. Everything you create is kept in Neon and moves with you.
- Set the repository secret `SITE_URL` to that address (see checklist D3).

## Later: moving to pinboard.tcqindia.com
Nothing is rebuilt. The database, posters, accounts and settings stay in Neon; only the address changes.

1. **Make the domain reachable by the Worker.** A Cloudflare Worker can only answer on a custom domain whose DNS is on Cloudflare.
   - *If tcqindia.com's DNS can move to Cloudflare (free):* add the domain in Cloudflare, switch the name servers at your registrar, and re-create your existing DNS records there (website, email, and the Resend records). Check email and the main website still work before switching.
   - *If it must stay where it is:* either keep using the workers.dev address, or ask me to move the site to Cloudflare Pages, which accepts a CNAME from an outside DNS host. That is a small change (the cron jobs would become a second tiny Worker).
2. In `wrangler.toml` uncomment and edit the route line: `routes = [{ pattern = "pinboard.tcqindia.com", custom_domain = true }]`, commit, and run the deploy workflow.
3. Change the repository secret `SITE_URL` to `https://pinboard.tcqindia.com`, run the deploy workflow again.
4. **Google sign-in (if used):** in Google Cloud Console add `https://pinboard.tcqindia.com/api/auth/google/callback` as an authorised redirect URI.
5. **Resend:** already verified for tcqindia.com, nothing to change.
6. Test sign-in, an upload and an email on the new address. Old sign-in sessions on the workers.dev address do not carry over (cookies belong to one address): everyone signs in once more.
7. Optional: once happy, remove the `workers.dev` address (Cloudflare dashboard → the Worker → Settings → Domains & Routes) so only the real domain answers. Share links that were made on the dummy address stop working then.

## Things that do NOT depend on the address
Posters, images, organisers, the Terms acceptance records, the activity log and all settings (they live in Neon); the Resend sender address; the repository and the deploy workflow.
