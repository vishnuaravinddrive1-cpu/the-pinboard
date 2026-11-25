import { useState } from 'react'
import { backend } from '../lib/backend'
import { formatEventDate } from '../lib/dates'
import { processPoster } from '../lib/image'
import { cleanHttpsUrl, cleanText } from '../lib/validate'
import type { Poster } from '../lib/types'

const chip: Record<string, string> = {
  live: 'bg-[#cfe8c9] text-[#1f4d18]', waiting: 'bg-peach text-brown', expired: 'bg-brown/15 text-brown',
  archived: 'bg-brown/15 text-brown', taken_down: 'bg-[#f6d8d2] text-[#6f2217]',
}
const label: Record<string, string> = { live: 'Live', waiting: 'Waiting', expired: 'Expired', archived: 'Archived', taken_down: 'Taken down' }

export default function PosterList({ posters, reload }: { posters: Poster[]; reload: () => void }) {
  const [editing, setEditing] = useState<Poster | null>(null)
  const [err, setErr] = useState('')
  if (!posters.length) return <div className="card p-6 text-center"><p className="font-semibold">You have not posted anything yet.</p><p className="caption">Tap “New poster” to pin your first event.</p></div>

  async function del(p: Poster) {
    if (!confirm(`Remove “${p.title}” from the board?`)) return
    try { await backend.deletePoster(p.id); reload() } catch (x) { setErr((x as Error).message) }
  }
  async function swap(p: Poster, f: File | undefined) {
    if (!f) return
    try { const r = await processPoster(f); await backend.replaceImage(p.id, r.full, r.thumb, r.width, r.height); reload() } catch (x) { setErr((x as Error).message) }
  }

  return (
    <>
      {err && <p role="alert" className="rounded-xl bg-[#f6d8d2] text-[#6f2217] font-medium p-3 mb-3">{err}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posters.map((p) => (
          <li key={p.id} className="card p-3 flex gap-3" data-testid="my-poster">
            <img src={p.thumb_url} alt="" className="w-20 h-28 object-cover rounded shrink-0 bg-brown/10" loading="lazy" />
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <h3 className="font-bold leading-tight break-words">{p.title}</h3>
              <p className="caption">{formatEventDate(p.event_date)} · {p.area}</p>
              <p><span className={`chip ${chip[p.status]}`}>{label[p.status]}{p.status === 'waiting' && p.queue_position ? ` · #${p.queue_position}` : ''}</span></p>
              {p.taken_down_reason && <p className="text-xs text-[#6f2217]">{p.taken_down_reason}</p>}
              <p className="text-sm">👁 {p.views} views · 🔗 {p.clicks} clicks</p>
              <div className="flex flex-wrap gap-2 mt-auto pt-1">
                <button className="btn-secondary !min-h-[44px] !px-3" onClick={() => setEditing(p)}>Edit</button>
                <label className="btn-secondary !min-h-[44px] !px-3 cursor-pointer">New image
                  <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => swap(p, e.target.files?.[0])} /></label>
                <button className="btn-ghost !min-h-[44px] !px-3" onClick={() => del(p)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {editing && <EditDialog p={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </>
  )
}

function EditDialog({ p, onClose, onSaved }: { p: Poster; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(p.title); const [date, setDate] = useState(p.event_date); const [url, setUrl] = useState(p.booking_url ?? '')
  const [err, setErr] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const link = cleanHttpsUrl(url)
    if (link === null) return setErr('The booking link must start with https://')
    if (cleanText(title).length < 3) return setErr('Please enter a title.')
    try { await backend.updatePoster(p.id, { title: cleanText(title), event_date: date, booking_url: link || null }); onSaved() } catch (x) { setErr((x as Error).message) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit poster"
        className="card w-full sm:max-w-md p-5 space-y-3 safe-bottom rounded-b-none sm:rounded-b-2xl">
        <h2 className="text-xl font-bold">Edit poster</h2>
        <div><label className="label" htmlFor="et">Title</label><input id="et" className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="ed">Date</label><input id="ed" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="eu">Booking link (optional)</label><input id="eu" type="url" className="field" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        {err && <p role="alert" className="text-[#8a2b1d] font-medium">{err}</p>}
        <div className="flex gap-2 justify-end"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div>
      </form>
    </div>
  )
}
