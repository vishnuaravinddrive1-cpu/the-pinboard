// Regenerates docs/EMAILS.md from the real templates:  npm run emails:doc   (in api/)
import { writeFileSync } from 'node:fs'
import { SAMPLE, TEMPLATE_INFO, render } from '../src/templates.ts'

const out: string[] = [
  '# Emails you send by hand',
  '',
  'Pin Board never sends email by itself. Whenever something needs an email, it appears in **Admin → Outbox** with the recipient, subject and message already written.',
  'Press **Open in my email app** (it opens your email program with everything filled in), send it from your own address (e.g. thecuriosityquotient@gmail.com), then press **Mark as sent**.',
  'If your email app does not open, use **Copy address / Copy subject / Copy message** instead.',
  '',
  'This file shows every message with example details. The real ones use the real names, event titles, dates and links. It is generated from `api/src/templates.ts` (`npm run emails:doc`).',
  '',
  '**Things that need NO email (you see them in the admin console instead):** a new organiser asking for access (Dashboard → "Needs your attention", Organisers tab), a new poster, a report (Reports tab). Organisers see "your poster is live" or "you are in the queue" on screen right after posting.',
  '',
  '| Email | When it appears in the Outbox |',
  '|---|---|',
  ...Object.entries(TEMPLATE_INFO).map(([, v]) => `| ${v.label} | ${v.when} |`),
  '',
]
for (const [key, info] of Object.entries(TEMPLATE_INFO)) {
  const m = render(key, SAMPLE[key], { siteUrl: 'https://pinboard.tcqindia.com' })
  out.push(`## ${info.label}`, '', `*${info.when}*`, '', `**Subject:** ${m.subject}`, '', '```text', m.text, '```', '')
}
out.push('## Good to know', '',
  '- **Sign-in links are personal and reusable.** Anyone with the link can sign in as that organiser (for about a year, or until a newer set of links replaces it: each organiser keeps their 5 newest). Send it only to the organiser\'s own address. If it leaks, press "Make sign-in link" a few times in Admin → Organisers: older links stop working.',
  '- **Reminders** appear in the Outbox each morning (after 00:00 IST) for events happening the next day (lead time is a setting). On busy days you can **Skip** them.',
  '- You can also make a link yourself (Admin → Organisers → **Make sign-in link**) and send it by WhatsApp instead of email.',
  '')
writeFileSync(new URL('../../docs/EMAILS.md', import.meta.url), out.join('\n'))
console.log('wrote docs/EMAILS.md')
