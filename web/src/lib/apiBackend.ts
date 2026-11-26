/** Talks to the Pin Board API (Cloudflare Worker) on the same origin. Session = HttpOnly cookie. */
import { config } from '../config'
import type {
  Backend, EmailRow, LogEntry, NewPosterInput, Poster, PosterAction, Profile, PublicPoster, Report, SessionUser, Settings, Stats,
} from './types'

async function call<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res: Response
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    })
  } catch {
    throw new Error('Network problem. Please check your connection and try again.')
  }
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  if (!res.ok) throw new Error(json?.error ?? (res.status === 401 ? 'Please log in.' : 'Something went wrong. Please try again.'))
  return json as T
}
const get = <T>(p: string) => call<T>('GET', p)
const post = <T = { ok: true }>(p: string, b: unknown = {}) => call<T>('POST', p, b)

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export const apiBackend: Backend = {
  listLive: () => get<PublicPoster[]>('/api/posters'),
  recordView: async (id) => { await post(`/api/posters/${id}/view`) },
  recordClick: async (id) => { await post(`/api/posters/${id}/click`) },
  report: async (id, reason) => { await post(`/api/posters/${id}/report`, { reason }) },

  async getUser() { return (await get<{ user: SessionUser | null }>('/api/me')).user },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
  async requestCode(email, opts) { await post('/api/auth/request-code', { email, mode: opts.mode, name: opts.name, terms_version: opts.mode === 'signup' ? config.termsVersion : undefined }) },
  async verifyCode(email, code) { await post('/api/auth/verify', { email, code }); notify() },
  async signInGoogle() { location.href = '/api/auth/google' },
  async authOptions() { const c = await get<{ google: boolean }>('/api/config'); return { google: c.google, demo: false } },
  async signOut() { await post('/api/auth/logout'); notify() },
  async acceptTerms() { await post('/api/me/accept-terms', { version: config.termsVersion }); notify() },

  myPosters: () => get<Poster[]>('/api/my/posters'),
  async createPoster(input: NewPosterInput, full, thumb) {
    const f = new FormData()
    f.set('meta', JSON.stringify(input))
    f.set('full', full, 'poster.webp'); f.set('thumb', thumb, 'thumb.webp')
    return call('POST', '/api/my/posters', f)
  },
  async updatePoster(id, patch) { await call('PATCH', `/api/posters/${id}`, patch) },
  async replaceImage(id, full, thumb, w, h) {
    const f = new FormData(); f.set('full', full, 'poster.webp'); f.set('thumb', thumb, 'thumb.webp'); f.set('width', String(w)); f.set('height', String(h))
    await call('POST', `/api/my/posters/${id}/image`, f)
  },
  async deletePoster(id) { await call('DELETE', `/api/my/posters/${id}`) },

  adminStats: () => get<Stats>('/api/admin/stats'),
  adminPosters: () => get<Poster[]>('/api/admin/posters'),
  adminOrganisers: () => get<Profile[]>('/api/admin/organisers'),
  async setOrganiserStatus(id, status, reason) { await post(`/api/admin/organisers/${id}/status`, { status, reason }) },
  async posterAction(id, action: PosterAction, arg) { await post(`/api/admin/posters/${id}/action`, { action, arg }) },
  adminLogs: () => get<LogEntry[]>('/api/admin/logs'),
  adminEmails: () => get<EmailRow[]>('/api/admin/emails'),
  adminReports: () => get<Report[]>('/api/admin/reports'),
  getSettings: () => get<Settings>('/api/settings'),
  async saveSettings(s) { await call('PUT', '/api/admin/settings', s) },
}
