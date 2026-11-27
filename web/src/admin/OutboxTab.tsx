import { useCallback, useEffect, useRef, useState } from 'react'
import CopyButton from '../components/CopyButton'
import { backend } from '../lib/backend'
import type { OutboxEmail } from '../lib/types'

type Status = 'queued' | 'sent' | 'skipped'
const labels: Record<Status, string> = { queued: 'To send', sent: 'Sent', skipped: 'Skipped' }
const mailto = (e: OutboxEmail) => `mailto:${e.to}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.text)}`

/** Pin Board never sends email by itself. Everything that needs to be emailed waits here, ready to send. */
export default function OutboxTab({ onChanged }: { onChanged?: (queued: number) => void }) {
  const [status, setStatus] = useState<Status>('queued')
  const [rows, setRows] = useState<OutboxEmail[] | null>(null); const [err, setErr] = useState('')
  const changed = useRef(onChanged); changed.current = onChanged
  const load = useCallback(() => {
    backend.adminOutbox(status).then((r) => { setRows(r); if (status === 'queued') changed.current?.(r.length) }).catch((e) => setErr(e.message))
  }, [status])
  useEffect(load, [load])

  async function set(e: OutboxEmail, s: Status) {
    setErr('')
    try { await backend.setOutboxStatus(e.id, s); load(); if (status !== 'queued') backend.adminStats().then((x) => changed.current?.(x.outbox)).catch(() => {}) } catch (x) { setErr((x as Error).message) }
  }

  return (
    <div>
      <p className="rounded-xl bg-peach/50 p-3 mb-3 text-[15px]">
        Pin Board does not send email by itself. Each message below is ready to go: press <strong className="font-semibold">Open in my email app</strong> (or copy the parts), send it from your own email, then press <strong className="font-semibold">Mark as sent</strong>.
      </p>
      <div role="tablist" aria-label="Outbox filter" className="flex gap-1 mb-3">
        {(Object.keys(labels) as Status[]).map((k) => (
          <button key={k} role="tab" aria-selected={status === k} onClick={() => { setRows(null); setStatus(k) }}
            className={`btn flex-1 ${status === k ? 'bg-brown text-cream' : 'bg-brown/10 text-brown'}`}>{labels[k]}</button>))}
      </div>
      {err && <p role="alert" className="text-[#8a2b1d] font-medium mb-2">{err}</p>}
      {rows && !rows.length && <p className="card p-5 text-center" data-testid="outbox-empty">{status === 'queued' ? 'Nothing to send. You are all caught up.' : 'Nothing here.'}</p>}
      <ul className="space-y-3">
        {rows?.map((e) => (
          <li key={e.id} className="card p-4 space-y-2" data-testid="outbox-item">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-peach">{e.template.replace(/_/g, ' ')}</span>
              <span className="caption">{new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
            </div>
            <p className="text-[15px]"><span className="font-semibold">To:</span> <span className="break-all select-all" data-testid="outbox-to">{e.to}</span></p>
            <p className="text-[15px]"><span className="font-semibold">Subject:</span> <span className="select-all" data-testid="outbox-subject">{e.subject}</span></p>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-[14px] leading-relaxed max-h-64 overflow-auto font-sans select-all" data-testid="outbox-body">{e.text}</pre>
            <div className="flex flex-wrap gap-2">
              <a href={mailto(e)} className="btn-primary !min-h-[44px] !px-3 text-sm no-underline">Open in my email app</a>
              <CopyButton text={e.to} label="Copy address" /><CopyButton text={e.subject} label="Copy subject" /><CopyButton text={e.text} label="Copy message" />
              {status === 'queued' && <>
                <button className="btn-secondary !min-h-[44px] !px-3 text-sm" onClick={() => set(e, 'sent')}>Mark as sent</button>
                <button className="btn-ghost !min-h-[44px] !px-3 text-sm" onClick={() => set(e, 'skipped')}>Skip</button></>}
              {status !== 'queued' && <button className="btn-ghost !min-h-[44px] !px-3 text-sm" onClick={() => set(e, 'queued')}>Put back in To send</button>}
            </div>
          </li>))}
      </ul>
    </div>
  )
}
