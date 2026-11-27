/** Demo-mode versions of the emails (the live API renders the real ones). Same wording, shortened. */
import { config } from '../config'

const SIGN_OFF = 'Warm regards,\nPin Board\nA free community service by The Curiosity Quotient\n\n(Reply to this email if you have any questions.)'
const longDate = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }
const wrap = (...p: (string | false | undefined)[]) => p.filter(Boolean).join('\n\n') + '\n\n' + SIGN_OFF

export function demoEmail(template: string, d: Record<string, string>): { subject: string; text: string } {
  const hi = `Hi ${d.name || 'there'},`
  const site = location.origin || `https://${config.domain}`
  switch (template) {
    case 'organiser_approved': return { subject: 'You are approved to post on Pin Board', text: wrap(hi, 'Welcome aboard! Your Pin Board account has been approved, so you can now post your event posters.', `Your sign-in link:\n${d.signin_url}`, `Pin Board is at ${site}`) }
    case 'organiser_rejected': return { subject: 'About your Pin Board sign-up', text: wrap(hi, 'Thank you for your interest in Pin Board. We are sorry: we could not approve your account this time.', d.reason && `Reason: ${d.reason}`) }
    case 'organiser_suspended': return { subject: 'Your Pin Board account is suspended', text: wrap(hi, 'Your Pin Board account has been suspended and your posters have been taken down.', d.reason && `Reason: ${d.reason}`) }
    case 'login_link': return { subject: 'Your new Pin Board sign-in link', text: wrap(hi, 'Here is a fresh personal sign-in link for Pin Board.', `Your sign-in link:\n${d.signin_url}`) }
    case 'poster_promoted': return { subject: `Your poster is now live: ${d.title}`, text: wrap(hi, `Good news: a space opened up and "${d.title}" has moved from the queue onto the board.`, `It will stay up until the end of ${longDate(d.event_date)}.`) }
    case 'poster_out_of_scope': return { subject: `We took down your poster: ${d.title}`, text: wrap(hi, `We have taken down "${d.title}" because it is outside what Pin Board is for (Terms section 3.1).`, `Reason: ${d.reason}`) }
    default: return { subject: 'Pin Board', text: wrap(hi, template) }
  }
}
