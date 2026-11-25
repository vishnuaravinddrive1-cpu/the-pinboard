import { useEffect, useRef, useState } from 'react'
import { backend } from '../lib/backend'
import type { PublicPoster } from '../lib/types'

export default function ReportDialog({ posters, initialId, onClose, onDone }: {
  posters: PublicPoster[]; initialId?: string; onClose: () => void; onDone: (m: string) => void
}) {
  const [id, setId] = useState(initialId ?? posters[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const first = useRef<HTMLSelectElement>(null)
  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 3) { setErr('Please tell us briefly what is wrong.'); return }
    setBusy(true); setErr('')
    try { await backend.report(id, reason.trim()); onDone('Thanks. The admin has been told.'); onClose() }
    catch (x) { setErr((x as Error).message); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rep-h"
        className="card w-full sm:max-w-md p-5 safe-bottom space-y-3 rounded-b-none sm:rounded-b-2xl">
        <h2 id="rep-h" className="text-xl font-bold">Report this poster</h2>
        <p className="caption">Out of scope, misleading or offensive? Tell us and the admin will review it.</p>
        <div>
          <label className="label" htmlFor="rep-p">Poster</label>
          <select id="rep-p" ref={first} className="field" value={id} onChange={(e) => setId(e.target.value)}>
            {posters.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rep-r">What is wrong?</label>
          <textarea id="rep-r" className="field py-2" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {err && <p role="alert" className="text-[#8a2b1d] font-medium">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
        </div>
      </form>
    </div>
  )
}
