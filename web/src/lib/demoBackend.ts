/** Demo backend: runs entirely in the browser (localStorage). Used when the website is not served together with the Pin Board API (e.g. `npm run dev`, static previews). */
import { config } from '../config'
import { addDays, istToday } from './dates'
import { hostOf } from './validate'
import { seedPosters } from './demoSeed'
import type {
  Backend, EmailRow, LogEntry, NewPosterInput, Poster, PosterAction, Profile, PublicPoster, Report, SessionUser, Settings, Stats,
} from './types'

interface State {
  posters: Poster[]; profiles: Profile[]; logs: LogEntry[]; emails: EmailRow[]; reports: Report[]
  settings: Settings; userId: string | null; reviewed: string[]; daily: Record<string, { views: number; clicks: number }>
}
const KEY = 'pinboard.demo.v2'
export const DEMO_CODE = '123456'
let pendingCode: { email: string; name: string; mode: 'login' | 'signup' } | null = null
const listeners = new Set<() => void>()
let state: State

const uid = () => Math.random().toString(36).slice(2, 10)
const nowIso = () => new Date().toISOString()

function fresh(): State {
  const { posters, profiles } = seedPosters()
  return {
    posters, profiles, logs: [], emails: [], reports: [], userId: null, reviewed: [], daily: {},
    settings: {
      board_limit: config.boardLimit, reminder_days: 1, admin_email: config.operator.contact, terms_version: config.termsVersion,
      retention_years: 3, categories: [...config.categories], areas: [...config.areas],
    },
  }
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { state = JSON.parse(raw); return } } catch { /* ignore */ }
  state = fresh()
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota: ignore */ } }
function notifyAuth() { listeners.forEach((l) => l()) }
load()

function log(actor: string, action: string, detail: string) {
  state.logs.unshift({ id: uid(), at: nowIso(), actor, action, detail })
  state.logs = state.logs.slice(0, 500)
}
function email(to: string, template: string) {
  state.emails.unshift({ id: uid(), to, template, status: 'sent', attempts: 1, created_at: nowIso() })
  log('system', 'email_sent', `${template} -> ${to}`)
}
function admin() { return state.profiles.find((p) => p.role === 'admin')! }

/** Expire, archive and promote - the demo equivalent of the midnight cron + triggers. */
function rebalance() {
  const today = istToday()
  for (const p of state.posters) {
    if (p.event_date < today) {
      if (p.status === 'live') { p.status = 'expired'; log('system', 'expired', p.title) }
      else if (p.status === 'waiting') { p.status = 'archived'; log('system', 'archived_waiting', p.title) }
    }
  }
  promote()
}
function liveCount() { return state.posters.filter((p) => p.status === 'live').length }
function waiting() { return state.posters.filter((p) => p.status === 'waiting').sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0)) }
function promote() {
  for (const p of waiting()) {
    if (liveCount() >= state.settings.board_limit) break
    p.status = 'live'; p.queue_position = null
    log('system', 'queue_promoted', p.title)
    email(p.organiser_email!, 'poster_promoted')
  }
  waiting().forEach((p, i) => { p.queue_position = i + 1 })
}
function me(): Profile | null { return state.profiles.find((p) => p.id === state.userId) ?? null }
function needUser(): Profile { const u = me(); if (!u) throw new Error('Please log in.'); return u }
function needAdmin(): Profile { const u = needUser(); if (u.role !== 'admin') throw new Error('Admins only.'); return u }
const blobUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })
const toPublic = (p: Poster): PublicPoster => ({
  id: p.id, title: p.title, event_date: p.event_date, booking_url: p.booking_url, area: p.area, category: p.category,
  image_url: p.image_url, thumb_url: p.thumb_url, width: p.width, height: p.height,
})

function flagsFor(p: Poster): string[] {
  if (state.reviewed.includes(p.id)) return []
  const f: string[] = []
  if (p.category === 'Other') f.push('Category: Other')
  if (p.area === 'Other') f.push('Area: other')
  const h = hostOf(p.booking_url)
  if (h) {
    const seenElsewhere = state.posters.some((q) => q.id !== p.id && hostOf(q.booking_url) === h && (state.reviewed.includes(q.id) || q.created_at < p.created_at))
    if (!seenElsewhere) f.push(`New link domain: ${h}`)
  }
  return f
}
const decorate = (p: Poster): Poster => ({ ...p, flags: flagsFor(p) })
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 15))

export const demoBackend: Backend = {
  async listLive() {
    rebalance(); save()
    const today = istToday()
    return delay(
      state.posters.filter((p) => p.status === 'live' && p.event_date >= today)
        .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.created_at.localeCompare(b.created_at))
        .slice(0, state.settings.board_limit).map(toPublic),
    )
  },
  async recordView(id) {
    const p = state.posters.find((x) => x.id === id); if (!p) return
    p.views++; const d = (state.daily[istToday()] ??= { views: 0, clicks: 0 }); d.views++; save()
  },
  async recordClick(id) {
    const p = state.posters.find((x) => x.id === id); if (!p) return
    p.clicks++; const d = (state.daily[istToday()] ??= { views: 0, clicks: 0 }); d.clicks++; save()
  },
  async report(id, reason) {
    const p = state.posters.find((x) => x.id === id); if (!p) throw new Error('Poster not found.')
    state.reports.unshift({ id: uid(), poster_id: id, poster_title: p.title, reason: reason.slice(0, 500), created_at: nowIso(), handled: false })
    email(state.settings.admin_email, 'admin_report'); log('viewer', 'reported', p.title); save()
  },

  async getUser() {
    const u = me(); if (!u) return null
    return { id: u.id, email: u.email, display_name: u.display_name, role: u.role, status: u.status, terms_version: u.terms_version }
  },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
  async requestCode(emailAddr, opts) {
    const em = emailAddr.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(em)) throw new Error('Please enter a valid email address.')
    const exists = state.profiles.some((p) => p.email === em)
    if (opts.mode === 'signup' && !exists && (opts.name ?? '').trim().length < 2) throw new Error("Please enter your name or your group's name.")
    if (opts.mode === 'login' && !exists) throw new Error('No account with that email. (Demo accounts: admin@demo.test, organiser@demo.test, newbie@demo.test, suspended@demo.test)')
    pendingCode = { email: em, name: (opts.name ?? '').trim(), mode: opts.mode }
  },
  async verifyCode(emailAddr, code) {
    const em = emailAddr.trim().toLowerCase()
    if (!pendingCode || pendingCode.email !== em) throw new Error('That code has expired. Please ask for a new one.')
    if (code.trim() !== DEMO_CODE) throw new Error('That code is not right. In demo mode the code is ' + DEMO_CODE + '.')
    let p = state.profiles.find((x) => x.email === em)
    if (!p) {
      p = { id: uid(), email: em, display_name: pendingCode.name, role: 'organiser', status: 'pending', terms_version: config.termsVersion, terms_accepted_at: nowIso(), created_at: nowIso() }
      state.profiles.push(p)
      log(p.email, 'terms_accepted', `version ${config.termsVersion}`); log(p.email, 'signup', 'awaiting approval')
      email(state.settings.admin_email, 'admin_new_organiser')
    }
    pendingCode = null; state.userId = p.id; save(); notifyAuth()
  },
  async signInGoogle() { throw new Error('Google sign-in is only available on the live site. In demo mode use email.') },
  async authOptions() { return { google: false, demo: true } },
  async signOut() { state.userId = null; save(); notifyAuth() },
  async acceptTerms() {
    const u = needUser(); u.terms_version = state.settings.terms_version; u.terms_accepted_at = nowIso()
    log(u.email, 'terms_accepted', `version ${u.terms_version}`); save(); notifyAuth()
  },

  async myPosters() {
    rebalance(); save(); const u = needUser()
    return state.posters.filter((p) => p.organiser_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(decorate)
  },
  async createPoster(input: NewPosterInput, full, thumb) {
    rebalance(); const u = needUser()
    if (u.status !== 'approved') throw new Error('Your account is not approved yet.')
    if (u.terms_version !== state.settings.terms_version) throw new Error('Please accept the latest Terms first.')
    if (!input.confirmed) throw new Error('Please tick the confirmation box.')
    if (input.event_date < istToday()) throw new Error('The event date is in the past.')
    if (state.posters.some((p) => p.organiser_id === u.id && p.title.toLowerCase() === input.title.toLowerCase() && p.event_date === input.event_date))
      throw new Error('You already posted this event (same title and date).')
    const [img, th] = await Promise.all([blobUrl(full), blobUrl(thumb)])
    const isLive = liveCount() < state.settings.board_limit
    const p: Poster = {
      id: uid() + uid(), title: input.title, event_date: input.event_date, booking_url: input.booking_url,
      area: input.area === 'Other' && input.area_other ? input.area_other : input.area,
      category: input.category, image_url: img, thumb_url: th, width: input.width, height: input.height,
      status: isLive ? 'live' : 'waiting', views: 0, clicks: 0, organiser_id: u.id, organiser_name: u.display_name,
      organiser_email: u.email, queue_position: isLive ? null : waiting().length + 1, created_at: nowIso(),
    }
    if (input.area === 'Other') p.area = input.area_other ? `Other: ${input.area_other}` : 'Other'
    state.posters.push(p)
    log(u.email, isLive ? 'poster_posted' : 'poster_queued', p.title)
    email(u.email, isLive ? 'poster_live' : 'poster_waiting'); email(state.settings.admin_email, 'admin_new_poster')
    save()
    return { id: p.id, status: p.status, queue_position: p.queue_position ?? null }
  },
  async updatePoster(id, patch) {
    const u = needUser(); const p = state.posters.find((x) => x.id === id && (x.organiser_id === u.id || u.role === 'admin'))
    if (!p) throw new Error('Poster not found.')
    Object.assign(p, patch); log(u.email, 'poster_edited', p.title); save()
  },
  async replaceImage(id, full, thumb, w, h) {
    const u = needUser(); const p = state.posters.find((x) => x.id === id && x.organiser_id === u.id)
    if (!p) throw new Error('Poster not found.')
    const [img, th] = await Promise.all([blobUrl(full), blobUrl(thumb)]); Object.assign(p, { image_url: img, thumb_url: th, width: w, height: h })
    log(u.email, 'image_replaced', p.title); save()
  },
  async deletePoster(id) {
    const u = needUser(); const p = state.posters.find((x) => x.id === id && x.organiser_id === u.id)
    if (!p) throw new Error('Poster not found.')
    // Never hard-delete: archive and keep for the retention period.
    p.status = 'archived'; log(u.email, 'poster_deleted', p.title); promote(); save()
  },

  async adminStats() {
    rebalance(); needAdmin()
    const s = state.posters, pf = state.profiles.filter((p) => p.role === 'organiser')
    const weeks: Record<string, number> = {}, cats: Record<string, number> = {}
    for (const p of s) {
      const wk = addDays(p.event_date, -((new Date(p.event_date).getUTCDay() + 6) % 7)); weeks[wk] = (weeks[wk] ?? 0) + 1
      cats[p.category] = (cats[p.category] ?? 0) + 1
    }
    const today = istToday()
    const daily = Array.from({ length: 14 }, (_, i) => { const day = addDays(today, i - 13); return { day, ...(state.daily[day] ?? { views: 0, clicks: 0 }) } })
    return {
      live: liveCount(), limit: state.settings.board_limit, waiting: waiting().length,
      archived: s.filter((p) => ['expired', 'archived'].includes(p.status)).length,
      pending: pf.filter((p) => p.status === 'pending').length, approved: pf.filter((p) => p.status === 'approved').length,
      suspended: pf.filter((p) => p.status === 'suspended').length,
      views: s.reduce((a, p) => a + p.views, 0), clicks: s.reduce((a, p) => a + p.clicks, 0),
      perWeek: Object.entries(weeks).sort().slice(-8).map(([week, count]) => ({ week, count })),
      topCategories: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
      daily, storageMb: Math.round(JSON.stringify(s.map((p) => p.image_url)).length / 1e4) / 100,
      emailsToday: state.emails.filter((e) => e.created_at.slice(0, 10) === nowIso().slice(0, 10)).length, emailQuota: 100,
    } satisfies Stats
  },
  async adminPosters() { rebalance(); needAdmin(); save(); return state.posters.map(decorate) },
  async adminOrganisers() {
    needAdmin()
    return state.profiles.filter((p) => p.role === 'organiser').map((p) => ({ ...p, poster_count: state.posters.filter((x) => x.organiser_id === p.id).length }))
  },
  async setOrganiserStatus(id, status, reason) {
    const a = needAdmin(); const p = state.profiles.find((x) => x.id === id); if (!p) throw new Error('Organiser not found.')
    p.status = status; log(a.email, `organiser_${status}`, `${p.email}${reason ? ' - ' + reason : ''}`)
    email(p.email, `organiser_${status}`)
    if (status === 'suspended') for (const x of state.posters) if (x.organiser_id === id && x.status === 'live') { x.status = 'taken_down'; x.taken_down_reason = 'Organiser suspended' }
    promote(); save()
  },
  async posterAction(id, action: PosterAction, arg) {
    const a = needAdmin(); const p = state.posters.find((x) => x.id === id); if (!p) throw new Error('Poster not found.')
    switch (action) {
      case 'take_down': p.status = 'taken_down'; p.taken_down_reason = arg ?? 'Taken down by admin'; break
      case 'out_of_scope':
        p.status = 'taken_down'; p.taken_down_reason = arg || 'Out of scope (Terms 3.1)'; email(p.organiser_email!, 'poster_out_of_scope'); break
      case 'restore': p.status = liveCount() < state.settings.board_limit && p.event_date >= istToday() ? 'live' : 'waiting'; break
      case 'extend': p.event_date = addDays(p.event_date, Number(arg ?? 1)); if (p.status === 'expired') p.status = 'waiting'; break
      case 'delete': state.posters = state.posters.filter((x) => x.id !== id); break
      case 'promote':
        if (p.status !== 'waiting') throw new Error('Only waiting posters can be promoted.')
        if (liveCount() >= state.settings.board_limit) throw new Error('The board is full. Take a poster down first.')
        { p.status = 'live'; p.queue_position = null; email(p.organiser_email!, 'poster_promoted') } break
      case 'mark_reviewed': state.reviewed.push(id); break
      case 'move_up': case 'move_down': {
        const q = waiting(); const i = q.findIndex((x) => x.id === id); const j = action === 'move_up' ? i - 1 : i + 1
        if (i >= 0 && q[j]) { [q[i].queue_position, q[j].queue_position] = [q[j].queue_position, q[i].queue_position] }
        break
      }
    }
    log(a.email, `poster_${action}`, p.title); promote(); save()
  },
  async adminLogs() { needAdmin(); return state.logs },
  async adminEmails() { needAdmin(); return state.emails },
  async adminReports() { needAdmin(); return state.reports },
  async getSettings() { return state.settings },
  async saveSettings(s) { const a = needAdmin(); state.settings = s; log(a.email, 'settings_saved', ''); promote(); save() },
}

export function resetDemo() { state = fresh(); save() }
export { admin as _adminForTests }
export type { SessionUser }
