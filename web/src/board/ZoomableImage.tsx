import { useEffect, useRef } from 'react'

interface Props {
  src: string
  thumb: string
  alt: string
  width: number
  height: number
  onTap: () => void
  onSwipeDown: () => void
}

/** Pinch-to-zoom, pan, wheel-zoom, tap detection and swipe-down-to-close. Uses transforms only. */
export default function ZoomableImage({ src, thumb, alt, width, height, onTap, onSwipeDown }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const full = useRef<HTMLImageElement>(null)
  const t = useRef({ s: 1, x: 0, y: 0 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ d0: 0, s0: 1, multi: false, moved: 0, t0: 0, startY: 0, startX: 0, dragY: 0 })
  const cb = useRef({ onTap, onSwipeDown })
  cb.current = { onTap, onSwipeDown }

  const apply = (extraY = 0) => {
    const { s, x, y } = t.current
    if (box.current) box.current.style.transform = `translate3d(${x}px, ${y + extraY}px, 0) scale(${s})`
  }
  const clamp = () => {
    const r = box.current?.parentElement?.getBoundingClientRect()
    if (!r) return
    const s = t.current.s
    const maxX = (r.width * (s - 1)) / 2, maxY = (r.height * (s - 1)) / 2
    t.current.x = Math.max(-maxX, Math.min(maxX, t.current.x))
    t.current.y = Math.max(-maxY, Math.min(maxY, t.current.y))
    if (s <= 1) { t.current.x = 0; t.current.y = 0 }
  }
  const dist = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }

  useEffect(() => {
    const el = box.current!.parentElement!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      t.current.s = Math.min(5, Math.max(1, t.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))))
      clamp(); apply()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function down(e: React.PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (pts.current.size === 1) Object.assign(g, { multi: false, moved: 0, t0: performance.now(), startX: e.clientX, startY: e.clientY, dragY: 0 })
    if (pts.current.size === 2) { g.multi = true; g.d0 = dist(); g.s0 = t.current.s }
  }
  function move(e: React.PointerEvent) {
    const prev = pts.current.get(e.pointerId)
    if (!prev) return
    const g = gesture.current
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.startX, e.clientY - g.startY))
    if (pts.current.size >= 2) {
      t.current.s = Math.min(5, Math.max(1, (g.s0 * dist()) / (g.d0 || 1)))
      clamp(); apply()
    } else if (t.current.s > 1.02) {
      t.current.x += dx; t.current.y += dy; clamp(); apply()
    } else if (e.pointerType !== 'mouse' && !g.multi) {
      g.dragY = Math.max(0, e.clientY - g.startY) // swipe down to close (touch/pen only)
      if (g.dragY > 4) apply(g.dragY)
    }
  }
  function up(e: React.PointerEvent) {
    const g = gesture.current
    pts.current.delete(e.pointerId)
    if (pts.current.size > 0) return
    if (g.dragY > 90 && t.current.s <= 1.02) { cb.current.onSwipeDown(); return }
    if (g.dragY) { g.dragY = 0; apply() }
    if (!g.multi && g.moved < 10 && performance.now() - g.t0 < 400) cb.current.onTap()
    if (t.current.s < 1.02) { t.current.s = 1; clamp(); apply() }
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ touchAction: 'none' }}>
      <div ref={box} className="zoomable relative max-w-full max-h-full" style={{ aspectRatio: `${width} / ${height}`, height: '100%', maxWidth: '100%' }}>
        <img src={thumb} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
        <img ref={full} src={src} alt={alt} draggable={false} decoding="async"
          className="absolute inset-0 w-full h-full object-contain rounded-sm shadow-2xl"
          onLoad={() => { if (full.current) full.current.style.opacity = '1' }} style={{ opacity: 0, transition: 'opacity .25s' }} />
      </div>
    </div>
  )
}
