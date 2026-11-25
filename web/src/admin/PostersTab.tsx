import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { backend } from '../lib/backend'
import { downloadCsv } from '../lib/csv'
import { addDays, formatEventDate } from '../lib/dates'
import type { Poster, PosterAction } from '../lib/types'

const tone: Record<string, string> = { live: 'bg-[#cfe8c9] text-[#1f4d18]', waiting: 'bg-peach text-brown', expired: 'bg-brown/15', archived: 'bg-brown/15', taken_down: 'bg-[#f6d8d2] text-[#6f2217]' }
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia('(min-width: 768px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => matchMedia('(min-width: 768px)').matches, () => true)
}
const FILTERS = ['all', 'live', 'waiting', 'past', 'taken_down', 'flagged'] as const

export default function PostersTab() {
  const [rows, setRows] = useState<Poster[]>([])
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [sort, setSort] = useState<'date' | 'title' | 'views' | 'created'>('date')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState<string | null>(null)
  const [edit, setEdit] = useState<Poster | null>(null)
  const desktop = useIsDesktop()
  const load = useCallback(() => { backend.adminPosters().then(setRows).catch((e) => setErr(e.message)) }, [])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const t = q.toLowerCase()
    return rows.filter((p) => {
      if (t && !`${p.title} ${p.organiser_name} ${p.organiser_email} ${p.area} ${p.category}`.toLowerCase().includes(t)) return false
      if (filter === 'past') return p.status === 'expired' || p.status === 'archived'
      if (filter === 'flagged') return (p.flags?.length ?? 0) > 0
      return filter === 'all' || p.status === filter
    }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'views' ? b.views - a.views : sort === 'created' ? b.created_at.localeCompare(a.created_at) : a.event_date.localeCompare(b.event_date))
  }, [rows, q, filter, sort])

  async function act(p: Poster, action: PosterAction, arg?: string, ask?: string) {
    if (ask && !confirm(ask)) return
    setBusy(p.id + action); setErr('')
    try { await backend.posterAction(p.id, action, arg); load() } catch (x) { setErr((x as Error).message) } finally { setBusy(null) }
  }
  const B = 'btn !min-h-[44px] !px-3 text-sm'

  return (
    <div>
      {desktop
        ? <div className="flex gap-2 mb-3 flex-wrap items-end"><Controls q={q} setQ={setQ} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} /></div>
        : <details className="card mb-3"><summary className="btn-secondary w-full cursor-pointer list-none">Search and filters</summary>
            <div className="p-3 space-y-2"><Controls q={q} setQ={setQ} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} /></div></details>}
      <div className="flex items-center justify-between mb-2"><p className="caption">{shown.length} of {rows.length} posters</p>
        <button className="btn-ghost !min-h-[44px]" onClick={() => downloadCsv('events', rows.map((p) => ({ id: p.id, title: p.title, date: p.event_date, status: p.status, organiser: p.organiser_email, area: p.area, category: p.category, booking_url: p.booking_url, views: p.views, clicks: p.clicks })))}>Export CSV</button></div>
      {err && <p role="alert" className="text-[#8a2b1d] font-medium mb-2">{err}</p>}
      <ul className="space-y-3">
        {shown.map((p) => (
          <li key={p.id} className="card p-3 flex gap-3" data-testid="admin-poster">
            <img src={p.thumb_url} alt="" className="w-16 h-24 object-cover rounded shrink-0 bg-brown/10" loading="lazy" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold break-words">{p.title}</h3>
                <span className={`chip ${tone[p.status]}`}>{p.status.replace('_', ' ')}{p.status === 'waiting' && p.queue_position ? ` #${p.queue_position}` : ''}</span></div>
              <p className="caption">{formatEventDate(p.event_date)} · {p.area} · {p.category}</p>
              <p className="text-sm">{p.organiser_name} · {p.organiser_email}</p>
              <p className="text-sm">👁 {p.views} · 🔗 {p.clicks}{p.booking_url && <> · <a href={p.booking_url} target="_blank" rel="noopener noreferrer">link</a></>}</p>
              {p.flags?.map((f) => <span key={f} className="chip bg-[#ffe1a8] text-[#5b3b00] mr-1" data-testid="flag">⚑ {f}</span>)}
              {p.taken_down_reason && <p className="text-xs text-[#6f2217]">Reason: {p.taken_down_reason}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {p.status === 'live' && <button className={`${B} bg-[#8a2b1d] text-cream`} disabled={!!busy} onClick={() => act(p, 'take_down', 'Taken down by admin')}>Take down</button>}
                {(p.status === 'live' || p.status === 'waiting') && <button className={`${B} bg-[#ffe1a8]`} onClick={() => { const r = prompt('Reason (sent to the organiser). Terms section 3.1:', 'Out of scope (Terms 3.1)'); if (r !== null) act(p, 'out_of_scope', r) }}>Out of scope</button>}
                {['taken_down', 'expired', 'archived'].includes(p.status) && <button className={`${B} btn-secondary`} onClick={() => act(p, 'restore')}>Restore</button>}
                <button className={`${B} btn-secondary`} onClick={() => act(p, 'extend', '7')}>Extend +7d</button>
                {p.status === 'waiting' && <>
                  <button className={`${B} btn-primary`} onClick={() => act(p, 'promote')}>Promote now</button>
                  <button className={`${B} btn-ghost`} aria-label="Move up in queue" onClick={() => act(p, 'move_up')}>↑</button>
                  <button className={`${B} btn-ghost`} aria-label="Move down in queue" onClick={() => act(p, 'move_down')}>↓</button></>}
                {(p.flags?.length ?? 0) > 0 && <button className={`${B} btn-ghost`} onClick={() => act(p, 'mark_reviewed')}>Mark reviewed</button>}
                <button className={`${B} btn-ghost`} onClick={() => setEdit(p)}>Edit</button>
                <button className={`${B} btn-ghost !text-[#8a2b1d]`} onClick={() => act(p, 'delete', undefined, `Permanently delete “${p.title}”? This cannot be undone.`)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="card p-5 text-center">Nothing matches.</p>}
      {edit && <EditModal p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function Controls(props: { q: string; setQ: (s: string) => void; filter: string; setFilter: (f: any) => void; sort: string; setSort: (s: any) => void }) {
  return (<>
    <div className="flex-1 min-w-[200px]"><label className="label" htmlFor="aq">Search</label><input id="aq" type="search" className="field" value={props.q} onChange={(e) => props.setQ(e.target.value)} placeholder="Title, organiser, area…" /></div>
    <div><label className="label" htmlFor="af">Show</label><select id="af" className="field" value={props.filter} onChange={(e) => props.setFilter(e.target.value)}>{FILTERS.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}</select></div>
    <div><label className="label" htmlFor="as">Sort</label><select id="as" className="field" value={props.sort} onChange={(e) => props.setSort(e.target.value)}><option value="date">Event date</option><option value="created">Newest</option><option value="title">Title</option><option value="views">Views</option></select></div>
  </>)
}

function EditModal({ p, onClose, onSaved }: { p: Poster; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(p.title); const [date, setDate] = useState(p.event_date); const [url, setUrl] = useState(p.booking_url ?? ''); const [err, setErr] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (url && !/^https:\/\//i.test(url)) return setErr('Booking link must be https://')
    try { await backend.updatePoster(p.id, { title: title.trim(), event_date: date || addDays(p.event_date, 0), booking_url: url.trim() || null }); onSaved() } catch (x) { setErr((x as Error).message) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit poster" className="card w-full sm:max-w-md p-5 space-y-3 safe-bottom rounded-b-none sm:rounded-b-2xl">
        <h2 className="text-xl font-bold">Edit poster</h2>
        <div><label className="label" htmlFor="at">Title</label><input id="at" className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="ad">Date</label><input id="ad" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="au">Booking link</label><input id="au" type="url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        {err && <p role="alert" className="text-[#8a2b1d]">{err}</p>}
        <div className="flex gap-2 justify-end"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div>
      </form>
    </div>
  )
}
