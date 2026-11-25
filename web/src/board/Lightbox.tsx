import { useEffect, useRef } from 'react'
import { googleCalendarUrl, downloadIcs } from '../lib/calendar'
import { formatEventDate } from '../lib/dates'
import { isDoubleTap } from '../lib/taps'
import type { PublicPoster } from '../lib/types'
import ZoomableImage from './ZoomableImage'

interface Props {
  poster: PublicPoster
  hasPrev: boolean
  hasNext: boolean
  onClose: () => void
  onNav: (dir: -1 | 1) => void
  onBook: (p: PublicPoster) => void
  onReport: (p: PublicPoster) => void
  onToast: (m: string) => void
}

export default function Lightbox({ poster: p, hasPrev, hasNext, onClose, onNav, onBook, onReport, onToast }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const openedAt = useRef(performance.now())
  const handlers = useRef({ onClose, onNav })
  handlers.current = { onClose, onNav } // always the latest, so rapid key presses never use a stale closure

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); handlers.current.onClose() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handlers.current.onNav(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handlers.current.onNav(1) }
      else if (e.key === 'Tab' && root.current) {
        const f = [...root.current.querySelectorAll<HTMLElement>('button, a[href]')].filter((x) => !x.hasAttribute('disabled'))
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  async function share() {
    const url = `${location.origin}/p/${p.id}`
    try {
      if (navigator.share) { await navigator.share({ title: p.title, text: `${p.title} - ${formatEventDate(p.event_date)}`, url }); return }
    } catch (e) { if ((e as Error).name === 'AbortError') return }
    try { await navigator.clipboard.writeText(url); onToast('Link copied.') } catch { onToast(url) }
  }

  // A second tap on the same poster (even on the cork, if the poster is small) counts as a double-tap.
  function backdropTap(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return
    if (isDoubleTap(p.id)) { onBook(p); return }
    if (performance.now() - openedAt.current < 450) return // never close on the tail of the opening click
    onClose()
  }
  function imageTap() { if (isDoubleTap(p.id)) onBook(p) }

  return (
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${p.title}, ${formatEventDate(p.event_date)}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black/85 lb-enter outline-none" onClick={backdropTap}>
      <div className="flex items-start gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 pointer-events-none">
        <div className="flex-1 min-w-0 text-cream pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg sm:text-2xl font-bold leading-tight break-words">{p.title}</h2>
          <p className="text-sm sm:text-base font-normal text-peach">{formatEventDate(p.event_date)} · {p.area}</p>
        </div>
        <button aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose() }}
          className="btn bg-cream text-brown pointer-events-auto shrink-0 w-11 h-11 !px-0 text-2xl" data-testid="close">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="relative flex-1 min-h-0 px-2 sm:px-16" onClick={backdropTap}>
        <ZoomableImage key={p.id} src={p.image_url} thumb={p.thumb_url} alt={p.title} width={p.width} height={p.height}
          onTap={imageTap} onSwipeDown={onClose} />
        {hasPrev && (
          <button aria-label="Previous poster" onClick={(e) => { e.stopPropagation(); onNav(-1) }}
            className="hidden sm:flex btn bg-cream/90 text-brown absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 !px-0 text-xl">‹</button>
        )}
        {hasNext && (
          <button aria-label="Next poster" onClick={(e) => { e.stopPropagation(); onNav(1) }}
            className="hidden sm:flex btn bg-cream/90 text-brown absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 !px-0 text-xl">›</button>
        )}
      </div>

      <div className="px-3 pt-2 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-2xl grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2">
          {p.booking_url && (
            <button className="btn-primary col-span-2 sm:col-span-1" onClick={() => onBook(p)}>Book now</button>
          )}
          <button className="btn-secondary" onClick={share}>Share</button>
          <a className="btn-secondary" href={googleCalendarUrl(p)} target="_blank" rel="noopener noreferrer">Google Calendar</a>
          <button className="btn-secondary" onClick={() => downloadIcs(p)}>Add to calendar (.ics)</button>
          <button className="btn-ghost !text-cream !border-cream/40 hover:!bg-white/10" onClick={() => onReport(p)}>Report</button>
        </div>
        <p className="text-center text-xs text-peach mt-2 hidden sm:block">Esc to close · ← → to browse · double-click to book</p>
      </div>
    </div>
  )
}
