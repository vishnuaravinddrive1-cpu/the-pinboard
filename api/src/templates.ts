// Plain-text emails for the admin to send by hand. Warm, short. Every template returns a subject and a text body.
export interface Rendered { subject: string; text: string }
export interface Ctx { siteUrl: string }

const SIGN_OFF = 'Warm regards,\nPin Board\nA free community service by The Curiosity Quotient\n\n(Reply to this email if you have any questions.)'

const longDate = (d: string) => {
  const [y, m, day] = String(d).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
const clean = (s: unknown) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()
const hi = (name: unknown) => `Hi ${clean(name) || 'there'},`
const body = (...paras: (string | false | null | undefined)[]) => paras.filter(Boolean).join('\n\n') + '\n\n' + SIGN_OFF

export const TEMPLATE_INFO: Record<string, { label: string; when: string }> = {
  organiser_approved: { label: 'Approval + sign-in link', when: 'You approved an organiser (or reinstated one).' },
  organiser_rejected: { label: 'Not approved', when: 'You rejected an organiser.' },
  organiser_suspended: { label: 'Account suspended', when: 'You suspended an organiser.' },
  login_link: { label: 'New sign-in link', when: 'An approved organiser asked for a new sign-in link.' },
  poster_promoted: { label: 'Poster moved off the queue', when: 'A waiting poster went live because a space opened.' },
  event_reminder: { label: 'Event reminder', when: 'One day (or your chosen lead time) before an event date.' },
  poster_out_of_scope: { label: 'Poster taken down (out of scope)', when: 'You used "Out of scope" on a poster.' },
}

export function render(template: string, d: Record<string, any>, ctx: Ctx): Rendered {
  switch (template) {
    case 'organiser_approved':
      return {
        subject: 'You are approved to post on Pin Board',
        text: body(hi(d.name), 'Welcome aboard! Your Pin Board account has been approved, so you can now post your event posters.',
          d.signin_url && `Use your personal sign-in link below. Open it once on each phone or computer you use; after that you stay signed in for about a month. Keep this email safe: anyone with the link can sign in as you.\n\nYour sign-in link:\n${d.signin_url}`,
          `Pin Board is at ${ctx.siteUrl}`,
          'A reminder of what we can post: events in or around Chennai that are experiences, arts, knowledge, discussion or social events. The full Terms are at ' + ctx.siteUrl + '/terms'),
      }
    case 'organiser_rejected':
      return {
        subject: 'About your Pin Board sign-up',
        text: body(hi(d.name), 'Thank you for your interest in Pin Board. We are sorry: we could not approve your account this time.',
          d.reason && `Reason: ${clean(d.reason)}`, 'If you think this is a mistake, just reply to this email and we will take another look.'),
      }
    case 'organiser_suspended':
      return {
        subject: 'Your Pin Board account is suspended',
        text: body(hi(d.name), 'Your Pin Board account has been suspended and your posters have been taken down.',
          d.reason && `Reason: ${clean(d.reason)}`, 'If you would like to talk about it, please reply to this email.'),
      }
    case 'login_link':
      return {
        subject: 'Your new Pin Board sign-in link',
        text: body(hi(d.name), 'Here is a fresh personal sign-in link for Pin Board. Open it on the phone or computer you want to sign in on.',
          `Your sign-in link:\n${d.signin_url}`, 'Keep it private: anyone with this link can sign in as you. If you did not ask for it, you can ignore this email.'),
      }
    case 'poster_promoted':
      return {
        subject: `Your poster is now live: ${clean(d.title)}`,
        text: body(hi(d.name), `Good news: a space opened up and "${clean(d.title)}" has moved from the queue onto the board.`,
          `It will stay up until the end of ${longDate(d.event_date)}.`, `See it here: ${ctx.siteUrl}/p/${d.poster_id}`),
      }
    case 'event_reminder':
      return {
        subject: `Reminder: ${clean(d.title)} is on ${longDate(d.event_date)}`,
        text: body(hi(d.name), `A quick reminder that "${clean(d.title)}" is on ${longDate(d.event_date)}.`,
          'Your poster stays on the board until the end of that day. We hope it goes wonderfully!', `Pin Board: ${ctx.siteUrl}`),
      }
    case 'poster_out_of_scope':
      return {
        subject: `We took down your poster: ${clean(d.title)}`,
        text: body(hi(d.name), `We have taken down "${clean(d.title)}" because it is outside what Pin Board is for (Terms section 3.1).`,
          `Reason: ${clean(d.reason)}`, 'Pin Board is for events in or around Chennai that are experience, arts, knowledge, discussion or social events. Political events are welcome only if they are neutral and meant to share knowledge.',
          'If you would like us to take another look, just reply to this email.'),
      }
    default:
      return { subject: 'Pin Board', text: body(hi(d.name), clean(template)) }
  }
}

/** Fills the names in payloads that only carry an email, so every message can start with "Hi <name>,". */
export const SAMPLE: Record<string, Record<string, unknown>> = {
  organiser_approved: { name: 'Meera', signin_url: 'https://pinboard.tcqindia.com/organiser?link=EXAMPLE-PERSONAL-TOKEN' },
  organiser_rejected: { name: 'Meera', reason: 'We could not tell what kind of events you plan to post.' },
  organiser_suspended: { name: 'Meera', reason: 'Repeated posters that were outside Chennai.' },
  login_link: { name: 'Meera', signin_url: 'https://pinboard.tcqindia.com/organiser?link=EXAMPLE-NEW-TOKEN' },
  poster_promoted: { name: 'Meera', title: 'Filter Coffee & Poetry Evening', event_date: '2026-12-05', poster_id: '00000000-0000-0000-0000-000000000000' },
  event_reminder: { name: 'Meera', title: 'Filter Coffee & Poetry Evening', event_date: '2026-12-05' },
  poster_out_of_scope: { name: 'Meera', title: 'Weekend Rally', reason: 'Out of scope (Terms 3.1): a political rally.' },
}
