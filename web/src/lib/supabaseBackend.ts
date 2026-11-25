import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config'
import type {
  Backend, EmailRow, LogEntry, NewPosterInput, Poster, PosterAction, Profile, PublicPoster, Report, SessionUser, Settings, Stats,
} from './types'

const sb: SupabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const publicUrl = (path: string) => `${config.supabaseUrl}/storage/v1/object/public/posters/${path}`
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

function toPublic(r: any): PublicPoster {
  return {
    id: r.id, title: r.title, event_date: r.event_date, booking_url: r.booking_url, area: r.area, category: r.category,
    image_url: publicUrl(r.image_path), thumb_url: publicUrl(r.thumb_path), width: r.width, height: r.height,
  }
}
function toPoster(r: any): Poster {
  return {
    ...toPublic(r), status: r.status, views: r.views ?? 0, clicks: r.clicks ?? 0, organiser_id: r.organiser_id,
    organiser_name: r.organiser_name ?? r.profiles?.display_name, organiser_email: r.organiser_email ?? r.profiles?.email,
    queue_position: r.queue_position ?? null, taken_down_reason: r.taken_down_reason, created_at: r.created_at, flags: r.flags ?? [],
  }
}

async function uploadPair(uid: string, full: Blob, thumb: Blob) {
  const id = crypto.randomUUID()
  const imagePath = `${uid}/${id}.webp`, thumbPath = `${uid}/${id}-t.webp`
  const a = await sb.storage.from('posters').upload(imagePath, full, { contentType: 'image/webp', cacheControl: '31536000' })
  fail(a.error)
  const b = await sb.storage.from('posters').upload(thumbPath, thumb, { contentType: 'image/webp', cacheControl: '31536000' })
  if (b.error) { await sb.storage.from('posters').remove([imagePath]); fail(b.error) }
  return { imagePath, thumbPath }
}
async function uid() {
  const { data } = await sb.auth.getUser()
  if (!data.user) throw new Error('Please log in.')
  return data.user.id
}

export const supabaseBackend: Backend = {
  async listLive() {
    const { data, error } = await sb.from('public_posters').select('*')
    fail(error); return (data ?? []).map(toPublic)
  },
  async recordView(id) { await sb.rpc('record_view', { p_id: id }) },
  async recordClick(id) { await sb.rpc('record_click', { p_id: id }) },
  async report(id, reason) { const { error } = await sb.rpc('report_poster', { p_id: id, p_reason: reason }); fail(error) },

  async getUser(): Promise<SessionUser | null> {
    const { data } = await sb.auth.getUser()
    if (!data.user) return null
    const { data: p } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
    if (!p) return null
    return { id: p.id, email: p.email, display_name: p.display_name, role: p.role, status: p.status, terms_version: p.terms_version }
  },
  onAuthChange(cb) { const { data } = sb.auth.onAuthStateChange(() => cb()); return () => data.subscription.unsubscribe() },
  async signUp(email, password, name) {
    const { data, error } = await sb.auth.signUp({
      email, password, options: { data: { display_name: name, terms_version: config.termsVersion }, emailRedirectTo: `${location.origin}/organiser` },
    })
    fail(error); return { needsConfirm: !data.session }
  },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); fail(error) },
  async signInGoogle() { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/organiser` } }); fail(error) },
  async signOut() { await sb.auth.signOut() },
  async acceptTerms() { const { error } = await sb.rpc('accept_terms', { p_version: config.termsVersion }); fail(error) },

  async myPosters() {
    const { data, error } = await sb.from('my_posters').select('*').order('created_at', { ascending: false })
    fail(error); return (data ?? []).map(toPoster)
  },
  async createPoster(input: NewPosterInput, full, thumb) {
    const u = await uid()
    const { imagePath, thumbPath } = await uploadPair(u, full, thumb)
    const { data, error } = await sb.rpc('create_poster', {
      p_title: input.title, p_event_date: input.event_date, p_booking_url: input.booking_url, p_area: input.area,
      p_area_other: input.area_other ?? null, p_category: input.category, p_confirmed: input.confirmed,
      p_image_path: imagePath, p_thumb_path: thumbPath, p_width: input.width, p_height: input.height,
    })
    if (error) { await sb.storage.from('posters').remove([imagePath, thumbPath]); throw new Error(error.message) }
    const r = Array.isArray(data) ? data[0] : data
    return { id: r.id, status: r.status, queue_position: r.queue_position ?? null }
  },
  async updatePoster(id, patch) { const { error } = await sb.from('posters').update(patch).eq('id', id); fail(error) },
  async replaceImage(id, full, thumb, w, h) {
    const u = await uid(); const { imagePath, thumbPath } = await uploadPair(u, full, thumb)
    const { error } = await sb.from('posters').update({ image_path: imagePath, thumb_path: thumbPath, width: w, height: h }).eq('id', id)
    fail(error)
  },
  async deletePoster(id) { const { error } = await sb.rpc('delete_poster', { p_id: id }); fail(error) },

  async adminStats() { const { data, error } = await sb.rpc('admin_stats'); fail(error); return data as Stats },
  async adminPosters() {
    const { data, error } = await sb.from('admin_posters').select('*').order('event_date', { ascending: true })
    fail(error); return (data ?? []).map(toPoster)
  },
  async adminOrganisers() {
    const { data, error } = await sb.from('admin_organisers').select('*').order('created_at', { ascending: false })
    fail(error); return (data ?? []) as Profile[]
  },
  async setOrganiserStatus(id, status, reason) { const { error } = await sb.rpc('admin_set_organiser_status', { p_id: id, p_status: status, p_reason: reason ?? null }); fail(error) },
  async posterAction(id, action: PosterAction, arg) { const { error } = await sb.rpc('admin_poster_action', { p_id: id, p_action: action, p_arg: arg ?? null }); fail(error) },
  async adminLogs() {
    const { data, error } = await sb.from('activity_log').select('*').order('at', { ascending: false }).limit(500)
    fail(error); return (data ?? []) as LogEntry[]
  },
  async adminEmails() {
    const { data, error } = await sb.from('email_queue').select('id,to_email,template,status,attempts,created_at,last_error').order('created_at', { ascending: false }).limit(300)
    fail(error)
    return (data ?? []).map((r: any) => ({ id: r.id, to: r.to_email, template: r.template, status: r.status === 'sent' ? 'sent' : r.status === 'queued' || r.status === 'sending' ? 'queued' : 'failed', attempts: r.attempts, created_at: r.created_at, error: r.last_error })) as EmailRow[]
  },
  async adminReports() {
    const { data, error } = await sb.from('reports').select('id,poster_id,reason,created_at,handled,posters(title)').order('created_at', { ascending: false }).limit(200)
    fail(error)
    return (data ?? []).map((r: any) => ({ id: r.id, poster_id: r.poster_id, poster_title: r.posters?.title ?? '', reason: r.reason, created_at: r.created_at, handled: r.handled })) as Report[]
  },
  async getSettings() {
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).single()
    fail(error); return data as Settings
  },
  async saveSettings(s) {
    const { error } = await sb.from('settings').update({ ...s }).eq('id', 1); fail(error)
  },
}
