import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import LogoChip from '../components/LogoChip'
import ReportDialog from '../components/ReportDialog'
import { useToast } from '../components/Toast'
import { config } from '../config'
import { backend } from '../lib/backend'
import { layoutBoard } from '../lib/layout'
import { bookingDebounced, isDoubleTap, resetTaps } from '../lib/taps'
import type { PublicPoster } from '../lib/types'
import Hint from './Hint'
import Lightbox from './Lightbox'
import PosterCard from './PosterCard'

const viewedKey = (id: string) => `pinboard.viewed.${id}`

export default function Board() {
  const openId = useMatch('/p/:id')?.params.id
  const nav = useNavigate()
  const loc = useLocation()
  const [posters, setPosters] = useState<PublicPoster[] | null>(null)
  const [error, setError] = useState('')
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth))
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  const [scrollTop, setScrollTop] = useState(0)
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [report, setReport] = useState<string | null | false>(false)
  const [toast, showToast] = useToast()
  const scroller = useRef<HTMLDivElement>(null)
  const openerEl = useRef<HTMLElement | null>(null)
  const navigated = useRef(false)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const hoverTimer = useRef<number>(0)
  const pendingHover = useRef<string | null>(null)
  const rafScroll = useRef(0)

  const load = useCallback(() => {
    setError('')
    backend.listLive().then(setPosters).catch((e) => setError(e.message || 'Could not load posters.'))
  }, [])
  useEffect(load, [load])

  // Track viewport size.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => { setWidth(el.clientWidth); setVh(el.clientHeight) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [posters])

  const layout = useMemo(() => (posters ? layoutBoard(posters, width) : null), [posters, width])
  const byId = useMemo(() => new Map((posters ?? []).map((p, i) => [p.id, { p, i }])), [posters])
  const open = openId ? byId.get(openId) : undefined
  // Browsing with rapid arrow presses: the router commits asynchronously, so remember where we are heading.
  const pendingNav = useRef<string | null>(null)
  if (pendingNav.current && openId === pendingNav.current) pendingNav.current = null

  // /p/{id} for a poster that is not live any more: say so and go to the board.
  useEffect(() => {
    if (posters && openId && !byId.has(openId)) { showToast('That event is no longer on the board.'); nav('/', { replace: true }) }
  }, [posters, openId, byId, nav, showToast])

  // Count a view when a poster is opened enlarged (once per session per poster).
  useEffect(() => {
    if (!open) return
    try { if (sessionStorage.getItem(viewedKey(open.p.id))) return; sessionStorage.setItem(viewedKey(open.p.id), '1') } catch { /* ignore */ }
    backend.recordView(open.p.id).catch(() => {})
  }, [open])

  // ----- hover intent (mouse only) -----
  const intent = useCallback((id: string | null) => {
    if (pendingHover.current === id) return
    pendingHover.current = id
    window.clearTimeout(hoverTimer.current)
    if (id === null) { setHovered(null); return }
    hoverTimer.current = window.setTimeout(() => setHovered(id), 80)
  }, [])
  const idAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-pid]')?.dataset.pid ?? null

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || open) return
    lastPointer.current = { x: e.clientX, y: e.clientY }
    intent((e.target as HTMLElement).closest<HTMLElement>('[data-pid]')?.dataset.pid ?? null)
  }
  function onScroll() {
    const el = scroller.current!
    cancelAnimationFrame(rafScroll.current)
    rafScroll.current = requestAnimationFrame(() => {
      setScrollTop(el.scrollTop)
      // Scrolling under a stationary pointer raises whichever poster ends up under it.
      if (lastPointer.current && !open) intent(idAt(lastPointer.current.x, lastPointer.current.y))
    })
  }

  // ----- open / close via history -----
  const openPoster = useCallback((id: string, el?: HTMLElement) => {
    if (isDoubleTap(id)) { const e = byId.get(id); if (e) book(e.p); return }
    openerEl.current = el ?? null
    if (openId === id) return
    navigated.current = true
    nav(`/p/${id}`, { state: { fromBoard: true } })
  }, [nav, openId, byId])

  const close = useCallback(() => {
    if ((loc.state as { fromBoard?: boolean } | null)?.fromBoard) nav(-1)
    else nav('/', { replace: true })
  }, [loc.state, nav])

  // Return focus to the poster (scroll position is untouched: the board never unmounts).
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) { wasOpen.current = true; return }
    if (!wasOpen.current) return
    wasOpen.current = false
    resetTaps() // closing ends any pending double-tap
    const el = openerEl.current && document.contains(openerEl.current) ? openerEl.current : null
    el?.focus({ preventScroll: true })
  }, [open])

  const navPoster = useCallback((dir: -1 | 1) => {
    if (!posters || !open) return
    const base = pendingNav.current ? (byId.get(pendingNav.current)?.i ?? open.i) : open.i
    const next = posters[base + dir]
    if (!next) return
    pendingNav.current = next.id
    openerEl.current = scroller.current?.querySelector<HTMLElement>(`[data-pid="${next.id}"]`) ?? null
    nav(`/p/${next.id}`, { replace: true, state: { fromBoard: true } })
    const pos = layout?.items.find((x) => x.id === next.id)
    if (pos && scroller.current) { // keep the board roughly in sync with where the viewer browsed to
      const el = scroller.current
      if (pos.y < el.scrollTop || pos.y + pos.h > el.scrollTop + el.clientHeight) el.scrollTo({ top: Math.max(0, pos.y - 80), behavior: 'auto' })
    }
  }, [posters, open, nav, layout, byId])

  function book(p: PublicPoster) {
    if (!p.booking_url) { showToast('No booking link for this event.'); return }
    if (!bookingDebounced()) return
    window.open(p.booking_url, '_blank', 'noopener,noreferrer')
    backend.recordClick(p.id).catch(() => {})
  }

  return (
    <div className="fixed inset-0 cork">
      <div className="board-frame" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <header className="fixed top-0 inset-x-0 z-[50] flex items-start justify-between gap-2 px-4 sm:px-8 safe-top pointer-events-none">
        <div className="pointer-events-auto rounded-xl bg-cream shadow-lg px-3 py-1.5 min-h-[44px] flex flex-col justify-center">
          <h1 className="text-lg sm:text-2xl font-bold leading-none text-brown">Pin Board</h1>
          <p className="caption leading-tight hidden xs:block">{config.tagline}</p>
        </div>
        <div className="pointer-events-auto"><LogoChip /></div>
      </header>

      <div ref={scroller} onScroll={onScroll} onPointerMove={onPointerMove}
        onPointerLeave={() => { lastPointer.current = null; intent(null) }}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain select-none"
        style={{ WebkitOverflowScrolling: 'touch' }} data-testid="board">
        {!posters && !error && <Skeletons width={width} />}
        {error && (
          <div className="relative z-10 mx-auto mt-32 max-w-sm card p-5 text-center">
            <p className="font-semibold mb-3">{error}</p><button className="btn-primary" onClick={load}>Try again</button>
          </div>
        )}
        {posters && posters.length === 0 && (
          <div className="relative z-10 mx-auto mt-32 max-w-sm card p-6 text-center">
            <h2 className="text-xl font-bold">The board is empty</h2>
            <p className="caption">New events will be pinned here soon.</p>
          </div>
        )}
        {posters && layout && (
          <div className="relative" style={{ height: layout.height, width: '100%' }}>
            {layout.items.map((pos, i) => {
              const p = posters[i]
              const near = pos.y + pos.h > scrollTop - vh && pos.y < scrollTop + vh * 2
              return <PosterCard key={p.id} p={p} pos={pos} near={near} index={i}
                raised={!open && (hovered === p.id || focused === p.id)}
                onOpen={openPoster} onFocusPoster={setFocused} />
            })}
          </div>
        )}
        <div className="relative z-[35] px-4 pb-[max(96px,env(safe-area-inset-bottom))] pt-2">
          <Footer onReport={posters && posters.length ? () => setReport(null) : undefined} />
        </div>
      </div>

      <Hint />
      {open && posters && (
        <Lightbox poster={open.p} hasPrev={open.i > 0} hasNext={open.i < posters.length - 1}
          onClose={close} onNav={navPoster} onBook={book} onReport={(p) => setReport(p.id)} onToast={showToast} />
      )}
      {report !== false && posters && (
        <ReportDialog posters={posters} initialId={report ?? open?.p.id} onClose={() => setReport(false)} onDone={showToast} />
      )}
      {toast}
    </div>
  )
}

/** Placeholder cards, absolutely positioned so swapping to the real board never shifts anything in the flow. */
function Skeletons({ width }: { width: number }) {
  const cols = width < 640 ? 2 : width < 1024 ? 3 : 4
  const pad = width < 640 ? 14 : 36, cw = (width - pad * 2) / cols
  return (
    <div className="relative" style={{ height: 2400 }} aria-label="Loading posters" role="status">
      {Array.from({ length: cols * 2 }, (_, i) => {
        const w = cw * 0.92, h = w * (i % 2 ? 1.25 : 1.33), c = i % cols, r = Math.floor(i / cols)
        return <div key={i} className="poster skeleton" style={{ width: w, height: h, transform: `translate3d(${pad + c * cw + cw * 0.04}px, ${70 + r * (h + 24)}px, 0)` }}><div className="sheet" /></div>
      })}
    </div>
  )
}
