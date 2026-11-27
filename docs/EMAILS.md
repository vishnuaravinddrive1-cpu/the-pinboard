# Emails you send by hand

Pin Board never sends email by itself. Whenever something needs an email, it appears in **Admin → Outbox** with the recipient, subject and message already written.
Press **Open in my email app** (it opens your email program with everything filled in), send it from your own address (e.g. thecuriosityquotient@gmail.com), then press **Mark as sent**.
If your email app does not open, use **Copy address / Copy subject / Copy message** instead.

This file shows every message with example details. The real ones use the real names, event titles, dates and links. It is generated from `api/src/templates.ts` (`npm run emails:doc`).

**Things that need NO email (you see them in the admin console instead):** a new organiser asking for access (Dashboard → "Needs your attention", Organisers tab), a new poster, a report (Reports tab). Organisers see "your poster is live" or "you are in the queue" on screen right after posting.

| Email | When it appears in the Outbox |
|---|---|
| Approval + sign-in link | You approved an organiser (or reinstated one). |
| Not approved | You rejected an organiser. |
| Account suspended | You suspended an organiser. |
| New sign-in link | An approved organiser asked for a new sign-in link. |
| Poster moved off the queue | A waiting poster went live because a space opened. |
| Event reminder | One day (or your chosen lead time) before an event date. |
| Poster taken down (out of scope) | You used "Out of scope" on a poster. |

## Approval + sign-in link

*You approved an organiser (or reinstated one).*

**Subject:** You are approved to post on Pin Board

```text
Hi Meera,

Welcome aboard! Your Pin Board account has been approved, so you can now post your event posters.

Use your personal sign-in link below. Open it once on each phone or computer you use; after that you stay signed in for about a month. Keep this email safe: anyone with the link can sign in as you.

Your sign-in link:
https://pinboard.tcqindia.com/organiser?link=EXAMPLE-PERSONAL-TOKEN

Pin Board is at https://pinboard.tcqindia.com

A reminder of what we can post: events in or around Chennai that are experiences, arts, knowledge, discussion or social events. The full Terms are at https://pinboard.tcqindia.com/terms

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## Not approved

*You rejected an organiser.*

**Subject:** About your Pin Board sign-up

```text
Hi Meera,

Thank you for your interest in Pin Board. We are sorry: we could not approve your account this time.

Reason: We could not tell what kind of events you plan to post.

If you think this is a mistake, just reply to this email and we will take another look.

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## Account suspended

*You suspended an organiser.*

**Subject:** Your Pin Board account is suspended

```text
Hi Meera,

Your Pin Board account has been suspended and your posters have been taken down.

Reason: Repeated posters that were outside Chennai.

If you would like to talk about it, please reply to this email.

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## New sign-in link

*An approved organiser asked for a new sign-in link.*

**Subject:** Your new Pin Board sign-in link

```text
Hi Meera,

Here is a fresh personal sign-in link for Pin Board. Open it on the phone or computer you want to sign in on.

Your sign-in link:
https://pinboard.tcqindia.com/organiser?link=EXAMPLE-NEW-TOKEN

Keep it private: anyone with this link can sign in as you. If you did not ask for it, you can ignore this email.

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## Poster moved off the queue

*A waiting poster went live because a space opened.*

**Subject:** Your poster is now live: Filter Coffee & Poetry Evening

```text
Hi Meera,

Good news: a space opened up and "Filter Coffee & Poetry Evening" has moved from the queue onto the board.

It will stay up until the end of Saturday, 5 December 2026.

See it here: https://pinboard.tcqindia.com/p/00000000-0000-0000-0000-000000000000

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## Event reminder

*One day (or your chosen lead time) before an event date.*

**Subject:** Reminder: Filter Coffee & Poetry Evening is on Saturday, 5 December 2026

```text
Hi Meera,

A quick reminder that "Filter Coffee & Poetry Evening" is on Saturday, 5 December 2026.

Your poster stays on the board until the end of that day. We hope it goes wonderfully!

Pin Board: https://pinboard.tcqindia.com

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## Poster taken down (out of scope)

*You used "Out of scope" on a poster.*

**Subject:** We took down your poster: Weekend Rally

```text
Hi Meera,

We have taken down "Weekend Rally" because it is outside what Pin Board is for (Terms section 3.1).

Reason: Out of scope (Terms 3.1): a political rally.

Pin Board is for events in or around Chennai that are experience, arts, knowledge, discussion or social events. Political events are welcome only if they are neutral and meant to share knowledge.

If you would like us to take another look, just reply to this email.

Warm regards,
Pin Board
A free community service by The Curiosity Quotient

(Reply to this email if you have any questions.)
```

## Good to know

- **Sign-in links are personal and reusable.** Anyone with the link can sign in as that organiser (for about a year, or until a newer set of links replaces it: each organiser keeps their 5 newest). Send it only to the organiser's own address. If it leaks, press "Make sign-in link" a few times in Admin → Organisers: older links stop working.
- **Reminders** appear in the Outbox each morning (after 00:00 IST) for events happening the next day (lead time is a setting). On busy days you can **Skip** them.
- You can also make a link yourself (Admin → Organisers → **Make sign-in link**) and send it by WhatsApp instead of email.
