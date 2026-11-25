import { useEffect, useState } from 'react'
import { backend } from '../lib/backend'
import type { Stats } from '../lib/types'

function Card({ label, value, sub, tone = '' }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-2xl p-4 bg-white border border-brown/10 shadow ${tone}`}>
      <p className="caption">{label}</p><p className="text-3xl font-bold leading-tight">{value}</p>{sub && <p className="text-sm text-brown/70">{sub}</p>}
    </div>
  )
}

function Bars({ data, label }: { data: { k: string; a: number; b?: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b ?? 0)))
  return (
    <figure>
      <figcaption className="font-semibold mb-2">{label}</figcaption>
      <svg viewBox={`0 0 ${data.length * 24} 100`} className="w-full h-36" role="img" aria-label={label} preserveAspectRatio="none">
        {data.map((d, i) => (
          <g key={d.k}>
            <title>{`${d.k}: ${d.a}${d.b !== undefined ? ' / ' + d.b : ''}`}</title>
            <rect x={i * 24 + 2} y={100 - (d.a / max) * 96} width={d.b !== undefined ? 9 : 18} height={(d.a / max) * 96} fill="#9B5033" rx="1.5" />
            {d.b !== undefined && <rect x={i * 24 + 12} y={100 - (d.b / max) * 96} width="9" height={(d.b / max) * 96} fill="#CC8463" rx="1.5" />}
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-brown/70"><span>{data[0]?.k.slice(5)}</span><span>{data.at(-1)?.k.slice(5)}</span></div>
    </figure>
  )
}

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { backend.adminStats().then(setS).catch((e) => setErr(e.message)) }, [])
  if (err) return <p role="alert" className="text-[#8a2b1d]">{err}</p>
  if (!s) return <p role="status">Loading…</p>
  const quotaNear = s.emailsToday >= s.emailQuota * 0.8
  return (
    <div className="space-y-5">
      {quotaNear && <p role="alert" className="rounded-xl bg-[#f6d8d2] text-[#6f2217] font-semibold p-3">Email quota warning: {s.emailsToday} of {s.emailQuota} emails used today.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Live posters" value={`${s.live} of ${s.limit}`} />
        <Card label="Waiting queue" value={s.waiting} />
        <Card label="Past (archived)" value={s.archived} />
        <Card label="Pending organisers" value={s.pending} tone={s.pending ? '!bg-peach' : ''} sub={`${s.approved} approved · ${s.suspended} suspended`} />
        <Card label="Total views" value={s.views.toLocaleString()} />
        <Card label="Booking clicks" value={s.clicks.toLocaleString()} />
        <Card label="Storage used" value={`${s.storageMb} MB`} sub="of 1 GB free" />
        <Card label="Emails today" value={`${s.emailsToday}/${s.emailQuota}`} />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-white p-4 border border-brown/10">
          <Bars label="Views (dark) and clicks (light), last 14 days" data={s.daily.map((d) => ({ k: d.day, a: d.views, b: d.clicks }))} />
        </div>
        <div className="rounded-2xl bg-white p-4 border border-brown/10">
          <Bars label="Events per week" data={s.perWeek.map((d) => ({ k: d.week, a: d.count }))} />
        </div>
      </div>
      <div className="rounded-2xl bg-white p-4 border border-brown/10">
        <h3 className="font-semibold mb-2">Top categories</h3>
        <ul className="space-y-2">{s.topCategories.map((c) => (
          <li key={c.category} className="flex items-center gap-3"><span className="w-28 shrink-0">{c.category}</span>
            <span className="h-3 rounded bg-terracotta" style={{ width: `${(c.count / Math.max(1, s.topCategories[0].count)) * 100}%` }} /><span className="text-sm">{c.count}</span></li>))}</ul>
      </div>
    </div>
  )
}
