import { useState } from 'react'

const KEY = 'pinboard.hint.v1'
function seen(): boolean { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

export default function Hint() {
  const [open, setOpen] = useState(() => !seen())
  if (!open) return null
  const desktop = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
  const text = desktop ? 'Click a poster to open it. Double-click to book.' : 'Tap a poster to open it. Double-tap to book.'
  const dismiss = () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode */ } setOpen(false) }
  return (
    <div role="note" data-testid="hint" className="fixed z-[45] left-1/2 -translate-x-1/2 bottom-[max(20px,env(safe-area-inset-bottom))] w-[min(92vw,460px)] flex items-center gap-2 rounded-2xl bg-cream text-brown shadow-2xl pl-4 pr-1.5 py-1.5">
      <p className="flex-1 font-medium text-[15px] leading-snug">{text}</p>
      <button className="btn-secondary !px-4" onClick={dismiss}>Got it</button>
    </div>
  )
}
