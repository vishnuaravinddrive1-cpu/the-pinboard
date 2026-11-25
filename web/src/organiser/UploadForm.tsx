import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { config } from '../config'
import { backend } from '../lib/backend'
import { formatEventDate, istToday } from '../lib/dates'
import { processPoster, type Processed } from '../lib/image'
import { cleanHttpsUrl, cleanText } from '../lib/validate'
import type { PosterStatus } from '../lib/types'
import PosterPreview from './PosterPreview'

interface Result { status: PosterStatus; position: number | null; title: string }

export default function UploadForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [file, setFile] = useState<Processed | null>(null)
  const [busyFile, setBusyFile] = useState(false)
  const [title, setTitle] = useState(''); const [date, setDate] = useState(''); const [url, setUrl] = useState('')
  const [area, setArea] = useState(''); const [areaOther, setAreaOther] = useState(''); const [category, setCategory] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [areas, setAreas] = useState<string[]>(config.areas); const [cats, setCats] = useState<string[]>([...config.categories])
  const snapshot = useRef<{ title: string } | null>(null)

  useEffect(() => { backend.getSettings().then((s) => { setAreas(s.areas); setCats(s.categories) }).catch(() => {}) }, [])
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.previewUrl) }, [file])

  async function pick(f: File | undefined) {
    if (!f) return
    setErr(''); setBusyFile(true)
    try { setFile(await processPoster(f)) } catch (x) { setFile(null); setErr((x as Error).message) } finally { setBusyFile(false) }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault(); setErr(''); setFailed(false)
    const t = cleanText(title, 120)
    const link = cleanHttpsUrl(url)
    if (!file) return setErr('Please choose a poster image or PDF.')
    if (t.length < 3) return setErr('Please enter the event title.')
    if (!date) return setErr('Please choose the event date.')
    if (date < istToday()) return setErr('The event date has already passed.')
    if (link === null) return setErr('The booking link must start with https:// (or leave it empty).')
    if (!area) return setErr('Please choose the area.')
    if (area === 'Other' && cleanText(areaOther, 60).length < 2) return setErr('Please type the area.')
    if (!category) return setErr('Please choose a category.')
    if (!confirmed) return setErr('Please tick the confirmation box.')
    setBusy(true); snapshot.current = { title: t }
    try {
      const r = await backend.createPoster(
        { title: t, event_date: date, booking_url: link || null, area, area_other: cleanText(areaOther, 60), category, confirmed, width: file.width, height: file.height },
        file.full, file.thumb)
      setResult({ status: r.status, position: r.queue_position, title: t })
    } catch (x) {
      const m = (x as Error).message
      setErr(/fetch|network|timeout|failed to/i.test(m) ? 'The upload did not go through. Check your connection and try again.' : m)
      setFailed(true)
    } finally { setBusy(false) }
  }

  if (result) {
    const waiting = result.status === 'waiting'
    return (
      <div className="card p-6 text-center max-w-lg mx-auto" role="status">
        <h2 className="text-2xl font-bold mb-2">{waiting ? 'You are in the queue' : 'Your poster is live!'}</h2>
        {waiting ? (
          <>
            <p className="mb-2">The board is full right now. Your poster is in the queue and will go up as soon as a space opens.</p>
            <p className="text-xl font-semibold text-rust mb-4">Queue position: {result.position}</p>
          </>
        ) : <p className="mb-4">“{result.title}” is on the board now and stays up until the end of {formatEventDate(date)}.</p>}
        <div className="flex gap-2 justify-center flex-wrap">
          <button className="btn-primary" onClick={onDone}>Go to my posters</button>
          {!waiting && <Link to="/" className="btn-secondary no-underline">See the board</Link>}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-xl mx-auto" noValidate>
      <div className="card p-4 sm:p-5 border-l-8 border-terracotta">
        <h2 className="font-bold text-lg mb-1">What can be posted</h2>
        <p className="text-[15px]">The event must be <strong className="font-semibold">in or around Chennai</strong> and be an <strong className="font-semibold">experience, arts, knowledge, discussion or social</strong> event. Political events are allowed only if neutral and meant to give knowledge: no campaigning, candidate or party promotion, or rallies. See the <Link to="/terms" target="_blank">Terms</Link>.</p>
      </div>

      <fieldset className="card p-4 sm:p-5 space-y-3">
        <legend className="sr-only">Poster file</legend>
        <p className="label">Poster</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="btn-secondary cursor-pointer">Take photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} /></label>
          <label className="btn-secondary cursor-pointer">Choose from gallery
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid="gallery" /></label>
          <label className="btn-secondary cursor-pointer">Choose file
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid="file" /></label>
        </div>
        {busyFile && <p role="status" className="caption">Preparing your poster…</p>}
        {file && <p className="caption" data-testid="file-info">Ready: {file.width}×{file.height}, {Math.round(file.full.size / 1024)} KB{file.wasPdf ? ' (first page of your PDF)' : ''}.</p>}
        <PosterPreview src={file?.previewUrl ?? null} title={title} date={date} ratio={file ? file.width / file.height : 0.75} />
      </fieldset>

      <div className="card p-4 sm:p-5 space-y-4">
        <div><label className="label" htmlFor="title">Event title *</label>
          <input id="title" className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="date">Event date *</label>
          <input id="date" type="date" className="field" min={istToday()} value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="caption mt-1">Your poster stays up until midnight at the end of this day (IST).</p></div>
        <div><label className="label" htmlFor="url">Booking link (optional)</label>
          <input id="url" type="url" inputMode="url" placeholder="https://" className="field" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="caption mt-1">Leave empty if there is nothing to book. Must start with https://</p></div>
        <div><label className="label" htmlFor="area">Area *</label>
          <select id="area" className="field" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Choose an area</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
          {area === 'Other' && <input aria-label="Other area" className="field mt-2" placeholder="Type the area or town" maxLength={60} value={areaOther} onChange={(e) => setAreaOther(e.target.value)} />}</div>
        <div><label className="label" htmlFor="cat">Category *</label>
          <select id="cat" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose a category</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>

      <label className="card p-4 flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input type="checkbox" className="mt-1 w-6 h-6 accent-[#A85A36] shrink-0" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="confirm" />
        <span>This event is in or around Chennai and fits one of the categories above, and I have read the <Link to="/terms" target="_blank">Terms</Link>.</span>
      </label>

      {err && <p role="alert" className="rounded-xl bg-[#f6d8d2] text-[#6f2217] font-medium p-3">{err}</p>}
      <div className="flex gap-2 sticky bottom-0 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        <button type="button" className="btn-ghost !bg-cream" onClick={onCancel}>Cancel</button>
        <button className="btn-primary flex-1 min-h-[52px] text-lg" disabled={busy || busyFile}>
          {busy ? 'Uploading…' : failed ? 'Try again' : 'Post my poster'}</button>
      </div>
      {busy && <div className="h-2 rounded bg-brown/20 overflow-hidden" role="progressbar" aria-label="Uploading"><div className="h-full w-1/2 bg-rust animate-pulse" /></div>}
    </form>
  )
}
