import { useEffect, useState } from 'react'
import { config } from '../config'
import { backend } from '../lib/backend'
import { downloadCsv } from '../lib/csv'
import type { LogEntry, Report, Settings } from '../lib/types'

function useLoad<T>(fn: () => Promise<T>) {
  const [d, setD] = useState<T | null>(null); const [e, setE] = useState('')
  useEffect(() => { fn().then(setD).catch((x) => setE(x.message)) }, [])  
  return [d, e] as const
}

export function LogTab() {
  const [rows, err] = useLoad<LogEntry[]>(() => backend.adminLogs())
  return (
    <div>
      <div className="flex justify-between items-center mb-2"><p className="caption">Latest {rows?.length ?? 0} events</p>
        <button className="btn-ghost" onClick={() => rows && downloadCsv('activity-log', rows as unknown as Record<string, unknown>[])}>Export CSV</button></div>
      {err && <p role="alert">{err}</p>}
      <ul className="space-y-2">{rows?.map((r) => (
        <li key={r.id} className="card px-3 py-2 text-sm"><span className="font-semibold">{r.action}</span> · {r.detail || '-'}<br /><span className="caption">{new Date(r.at).toLocaleString('en-IN', { timeZone: config.timezone })} · {r.actor}</span></li>))}</ul>
    </div>
  )
}

export function ReportsTab() {
  const [rows, err] = useLoad<Report[]>(() => backend.adminReports())
  return (
    <div>{err && <p role="alert">{err}</p>}
      {rows && !rows.length && <p className="card p-5 text-center">No reports. Good.</p>}
      <ul className="space-y-2">{rows?.map((r) => (
        <li key={r.id} className="card p-3"><p className="font-bold">{r.poster_title}</p><p>{r.reason}</p><p className="caption">{new Date(r.created_at).toLocaleString('en-IN', { timeZone: config.timezone })}</p></li>))}</ul>
    </div>
  )
}

export function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  useEffect(() => { backend.getSettings().then(setS).catch((e) => setErr(e.message)) }, [])
  if (!s) return <p role="status">{err || 'Loading…'}</p>
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v })
  const num = (k: 'board_limit' | 'reminder_days' | 'retention_years') => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Math.max(0, Number(e.target.value) || 0))
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    try { await backend.saveSettings(s!); setMsg('Saved.') } catch (x) { setErr((x as Error).message) }
  }
  return (
    <form onSubmit={save} className="card p-4 sm:p-6 space-y-4 max-w-xl">
      <div><label className="label" htmlFor="s1">Board limit (live posters)</label><input id="s1" type="number" min={1} className="field" value={s.board_limit} onChange={num('board_limit')} /></div>
      <div><label className="label" htmlFor="s2">Reminder lead time (days before the event)</label><input id="s2" type="number" min={0} className="field" value={s.reminder_days} onChange={num('reminder_days')} /></div>
      <div><label className="label" htmlFor="s3">Admin email</label><input id="s3" type="email" className="field" value={s.admin_email} onChange={(e) => set('admin_email', e.target.value)} /></div>
      <div><label className="label" htmlFor="s4">Current Terms version</label><input id="s4" className="field" value={s.terms_version} onChange={(e) => set('terms_version', e.target.value)} />
        <p className="caption">Changing this makes every organiser accept the Terms again before their next upload. Keep it equal to <code>termsVersion</code> in web/src/config.ts.</p></div>
      <div><label className="label" htmlFor="s5">Archive retention (years)</label><input id="s5" type="number" min={0} className="field" value={s.retention_years} onChange={num('retention_years')} /></div>
      <div><label className="label" htmlFor="s6">Allowed categories (one per line)</label><textarea id="s6" rows={5} className="field py-2" value={s.categories.join('\n')} onChange={(e) => set('categories', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} /></div>
      <div><label className="label" htmlFor="s7">Allowed areas (one per line)</label><textarea id="s7" rows={8} className="field py-2" value={s.areas.join('\n')} onChange={(e) => set('areas', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} /></div>
      {err && <p role="alert" className="text-[#8a2b1d]">{err}</p>}{msg && <p role="status" className="text-rust font-semibold">{msg}</p>}
      <button className="btn-primary w-full sm:w-auto min-h-[52px]">Save settings</button>
    </form>
  )
}
