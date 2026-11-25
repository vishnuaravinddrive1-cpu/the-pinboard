// Email content. Plain, warm, short. All user-supplied text is HTML-escaped.
export interface Ctx { siteUrl: string; takedownUrl: (posterId: string) => Promise<string>; adminEmail: string }
export interface Rendered { subject: string; html: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const BROWN = '#382525', RUST = '#A85A36', CREAM = '#FAF3E6'

function wrap(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:${CREAM};font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;color:${BROWN}">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:${RUST};margin:0 0 4px">Pin Board · What's happening in Chennai</p>
<h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${body}
<hr style="border:none;border-top:1px solid #d9cdb4;margin:24px 0 12px">
<p style="font-size:12px;color:${RUST}">A free community service by The Curiosity Quotient. Questions? Just reply to this email.</p>
</div></body></html>`
}
const p = (s: string) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${s}</p>`
const btn = (href: string, label: string) => `<p style="margin:16px 0"><a href="${esc(href)}" style="background:${RUST};color:${CREAM};padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${esc(label)}</a></p>`
const date = (d: string) => { const [y, m, day] = String(d).split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }

export async function render(template: string, d: Record<string, any>, ctx: Ctx): Promise<Rendered> {
  const board = `${ctx.siteUrl}/`
  switch (template) {
    case 'organiser_approved':
      return { subject: 'You are approved to post on Pin Board', html: wrap('You are approved', p(`Hi ${esc(d.name)}, welcome aboard! You can now post your event posters.`) + btn(`${ctx.siteUrl}/organiser`, 'Post a poster')) }
    case 'organiser_rejected':
      return { subject: 'About your Pin Board sign-up', html: wrap('Not approved this time', p(`Hi ${esc(d.name)}, thanks for signing up. We could not approve your account.`) + (d.reason ? p(`Reason: ${esc(d.reason)}`) : '') + p('If you think this is a mistake, reply to this email.')) }
    case 'organiser_suspended':
      return { subject: 'Your Pin Board account is suspended', html: wrap('Account suspended', p(`Hi ${esc(d.name)}, your account has been suspended and your posters have been taken down.`) + (d.reason ? p(`Reason: ${esc(d.reason)}`) : '') + p('Reply to this email if you would like to talk about it.')) }
    case 'poster_live':
      return { subject: `Your poster is live: ${d.title}`, html: wrap('Your poster is on the board', p(`“${esc(d.title)}” is live and will stay up until the end of ${esc(date(d.event_date))}.`) + btn(`${ctx.siteUrl}/p/${d.poster_id}`, 'See it on the board')) }
    case 'poster_waiting':
      return { subject: `Your poster is in the queue: ${d.title}`, html: wrap('You are in the queue', p('The board is full right now. Your poster is in the queue and will go up as soon as a space opens.') + p(`“${esc(d.title)}” · queue position <strong>${esc(d.queue_position)}</strong>`)) }
    case 'poster_promoted':
      return { subject: `Your poster is now live: ${d.title}`, html: wrap('A space opened up', p(`“${esc(d.title)}” has moved from the queue onto the board.`) + btn(`${ctx.siteUrl}/p/${d.poster_id}`, 'See it on the board')) }
    case 'event_reminder':
      return { subject: `Reminder: ${d.title} is on ${date(d.event_date)}`, html: wrap('Your event is coming up', p(`“${esc(d.title)}” is on ${esc(date(d.event_date))}. Your poster stays on the board until the end of that day.`) + btn(board, 'Open Pin Board')) }
    case 'poster_out_of_scope':
      return { subject: `We took down your poster: ${d.title}`, html: wrap('Poster taken down', p(`“${esc(d.title)}” was taken down because it is outside what Pin Board is for (Terms section 3.1).`) + p(`Reason: ${esc(d.reason)}`) + p('Events must be in or around Chennai and be experience, arts, knowledge, discussion or social events. Reply if you would like us to take another look.')) }
    case 'admin_new_poster': {
      const link = await ctx.takedownUrl(d.poster_id)
      return { subject: `New poster: ${d.title}`, html: wrap('New poster posted', p(`<strong>${esc(d.title)}</strong><br>${esc(date(d.event_date))}<br>By ${esc(d.organiser)} (${esc(d.organiser_email)}) · ${esc(d.status)}`) + btn(`${ctx.siteUrl}/admin`, 'Open admin') + p(`<a href="${esc(link)}" style="color:#8a2b1d;font-weight:600">One-click take-down</a>`)) }
    }
    case 'admin_new_organiser':
      return { subject: `New organiser awaiting approval: ${d.name}`, html: wrap('Organiser awaiting approval', p(`${esc(d.name)} (${esc(d.email)}) has signed up.`) + btn(`${ctx.siteUrl}/admin`, 'Review in admin')) }
    case 'admin_report': {
      const link = await ctx.takedownUrl(d.poster_id)
      return { subject: `Poster reported: ${d.title}`, html: wrap('A poster was reported', p(`<strong>${esc(d.title)}</strong><br>Reason: ${esc(d.reason)}`) + btn(`${ctx.siteUrl}/admin`, 'Open admin') + p(`<a href="${esc(link)}" style="color:#8a2b1d;font-weight:600">One-click take-down</a>`)) }
    }
    case 'admin_quota_warning':
      return { subject: 'Pin Board: email quota almost used up today', html: wrap('Email quota warning', p(`${esc(d.sent)} of ${esc(d.quota)} emails have been sent today. Remaining emails will wait in the queue and go out tomorrow.`)) }
    default:
      return { subject: 'Pin Board', html: wrap('Pin Board', p(esc(template))) }
  }
}
