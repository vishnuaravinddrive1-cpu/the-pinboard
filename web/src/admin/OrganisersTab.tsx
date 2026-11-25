import { useCallback, useEffect, useMemo, useState } from 'react'
import { backend } from '../lib/backend'
import { downloadCsv } from '../lib/csv'
import type { OrganiserStatus, Profile } from '../lib/types'

const tone: Record<string, string> = { pending: 'bg-peach', approved: 'bg-[#cfe8c9] text-[#1f4d18]', rejected: 'bg-[#f6d8d2] text-[#6f2217]', suspended: 'bg-[#f6d8d2] text-[#6f2217]' }

export default function OrganisersTab() {
  const [rows, setRows] = useState<Profile[]>([]); const [q, setQ] = useState(''); const [f, setF] = useState('all'); const [err, setErr] = useState('')
  const load = useCallback(() => { backend.adminOrganisers().then(setRows).catch((e) => setErr(e.message)) }, [])
  useEffect(load, [load])
  const shown = useMemo(() => rows.filter((r) => (f === 'all' || r.status === f) && `${r.display_name} ${r.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || b.created_at.localeCompare(a.created_at)), [rows, q, f])

  async function set(r: Profile, s: OrganiserStatus) {
    let reason: string | undefined
    if (s === 'rejected' || s === 'suspended') { const x = prompt(`Reason for ${s === 'rejected' ? 'rejecting' : 'suspending'} ${r.email} (included in the email):`, ''); if (x === null) return; reason = x }
    try { await backend.setOrganiserStatus(r.id, s, reason); load() } catch (x) { setErr((x as Error).message) }
  }
  const B = 'btn !min-h-[44px] !px-4'
  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]"><label className="label" htmlFor="oq">Search</label><input id="oq" type="search" className="field" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label className="label" htmlFor="of">Status</label><select id="of" className="field" value={f} onChange={(e) => setF(e.target.value)}>{['all', 'pending', 'approved', 'rejected', 'suspended'].map((s) => <option key={s}>{s}</option>)}</select></div>
        <button className="btn-ghost" onClick={() => downloadCsv('organisers', rows.map((r) => ({ name: r.display_name, email: r.email, status: r.status, terms_version: r.terms_version, terms_accepted_at: r.terms_accepted_at, posters: r.poster_count, joined: r.created_at })))}>Export CSV</button>
      </div>
      {err && <p role="alert" className="text-[#8a2b1d] mb-2">{err}</p>}
      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="card p-4 flex flex-wrap items-center gap-3" data-testid="admin-organiser">
            <div className="flex-1 min-w-[200px]"><p className="font-bold">{r.display_name} <span className={`chip ${tone[r.status]}`}>{r.status}</span></p>
              <p className="text-sm">{r.email} · {r.poster_count ?? 0} posters</p>
              <p className="caption">Terms: {r.terms_version ?? 'not accepted'}{r.terms_accepted_at ? ` on ${r.terms_accepted_at.slice(0, 10)}` : ''}</p></div>
            <div className="flex gap-2 flex-wrap">
              {(r.status === 'pending') && <><button className={`${B} btn-primary`} onClick={() => set(r, 'approved')}>Approve</button><button className={`${B} btn-ghost`} onClick={() => set(r, 'rejected')}>Reject</button></>}
              {r.status === 'approved' && <button className={`${B} bg-[#8a2b1d] text-cream`} onClick={() => set(r, 'suspended')}>Suspend</button>}
              {(r.status === 'suspended' || r.status === 'rejected') && <button className={`${B} btn-secondary`} onClick={() => set(r, 'approved')}>{r.status === 'suspended' ? 'Reinstate' : 'Approve'}</button>}
            </div>
          </li>))}
      </ul>
      {!shown.length && <p className="card p-5 text-center">No organisers match.</p>}
    </div>
  )
}
