export type PosterStatus = 'waiting' | 'live' | 'expired' | 'taken_down' | 'archived'
export type OrganiserStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type Role = 'organiser' | 'admin'

export interface Poster {
  id: string
  title: string
  event_date: string // YYYY-MM-DD (IST calendar date)
  booking_url: string | null
  area: string
  category: string
  image_url: string
  thumb_url: string
  width: number
  height: number
  status: PosterStatus
  views: number
  clicks: number
  organiser_id: string
  organiser_name?: string
  organiser_email?: string
  queue_position?: number | null
  taken_down_reason?: string | null
  created_at: string
  flags?: string[]
}

/** What the public board is allowed to know about a poster. */
export type PublicPoster = Pick<
  Poster,
  'id' | 'title' | 'event_date' | 'booking_url' | 'area' | 'category' | 'image_url' | 'thumb_url' | 'width' | 'height'
>

export interface Profile {
  id: string
  email: string
  display_name: string
  role: Role
  status: OrganiserStatus
  terms_version: string | null
  terms_accepted_at: string | null
  created_at: string
  poster_count?: number
}

export interface NewPosterInput {
  title: string
  event_date: string
  booking_url: string | null
  area: string
  area_other?: string
  category: string
  confirmed: boolean
  width: number
  height: number
}

export interface LogEntry {
  id: string
  at: string
  actor: string
  action: string
  detail: string
}

export interface EmailRow {
  id: string
  to: string
  template: string
  status: 'queued' | 'sent' | 'failed'
  attempts: number
  created_at: string
  error?: string | null
}

export interface Settings {
  board_limit: number
  reminder_days: number
  admin_email: string
  terms_version: string
  retention_years: number
  categories: string[]
  areas: string[]
}

export interface Stats {
  live: number
  limit: number
  waiting: number
  archived: number
  pending: number
  approved: number
  suspended: number
  views: number
  clicks: number
  perWeek: { week: string; count: number }[]
  topCategories: { category: string; count: number }[]
  daily: { day: string; views: number; clicks: number }[]
  storageMb: number
  emailsToday: number
  emailQuota: number
}

export interface SessionUser {
  id: string
  email: string
  display_name: string
  role: Role
  status: OrganiserStatus
  terms_version: string | null
}

export interface Report { id: string; poster_id: string; poster_title: string; reason: string; created_at: string; handled: boolean }

export type PosterAction = 'take_down' | 'restore' | 'extend' | 'delete' | 'promote' | 'out_of_scope' | 'move_up' | 'move_down' | 'mark_reviewed'

export interface Backend {
  // public
  listLive(): Promise<PublicPoster[]>
  recordView(id: string): Promise<void>
  recordClick(id: string): Promise<void>
  report(id: string, reason: string): Promise<void>
  // auth
  getUser(): Promise<SessionUser | null>
  onAuthChange(cb: () => void): () => void
  signUp(email: string, password: string, name: string): Promise<{ needsConfirm: boolean }>
  signIn(email: string, password: string): Promise<void>
  signInGoogle(): Promise<void>
  signOut(): Promise<void>
  acceptTerms(): Promise<void>
  // organiser
  myPosters(): Promise<Poster[]>
  createPoster(input: NewPosterInput, full: Blob, thumb: Blob): Promise<{ id: string; status: PosterStatus; queue_position: number | null }>
  updatePoster(id: string, patch: { title?: string; event_date?: string; booking_url?: string | null }): Promise<void>
  replaceImage(id: string, full: Blob, thumb: Blob, w: number, h: number): Promise<void>
  deletePoster(id: string): Promise<void>
  // admin
  adminStats(): Promise<Stats>
  adminPosters(): Promise<Poster[]>
  adminOrganisers(): Promise<Profile[]>
  setOrganiserStatus(id: string, status: OrganiserStatus, reason?: string): Promise<void>
  posterAction(id: string, action: PosterAction, arg?: string): Promise<void>
  adminLogs(): Promise<LogEntry[]>
  adminEmails(): Promise<EmailRow[]>
  adminReports(): Promise<Report[]>
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
}
