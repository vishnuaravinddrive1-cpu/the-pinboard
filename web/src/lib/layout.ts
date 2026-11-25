/** Seeded irregular collage layout. Deterministic per poster id. */
export interface Placed { id: string; x: number; y: number; w: number; h: number; rot: number; z: number; pinX: number }
export interface LayoutResult { items: Placed[]; height: number }

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface LayoutInput { id: string; width: number; height: number }

/**
 * Input must already be sorted soonest-first. Soonest gets the highest z.
 * Overlap is capped (<= ~28% vertical, <= ~18% horizontal) so every poster keeps >= ~55% visible.
 */
export function layoutBoard(posters: LayoutInput[], boardWidth: number): LayoutResult {
  const mobile = boardWidth < 640
  const cols = boardWidth < 420 ? 2 : boardWidth < 640 ? 2 : boardWidth < 1024 ? 3 : boardWidth < 1400 ? 4 : 5
  const pad = mobile ? 14 : 36
  const inner = boardWidth - pad * 2
  const colW = inner / cols
  const overlapY = mobile ? [0.04, 0.12] : [0.1, 0.26]
  const jitterX = mobile ? 0.06 : 0.1
  const top = pad + 56 // leave room for header chip
  const bottoms = new Array(cols).fill(top) // true bottom edge of the last poster in each column
  const started = new Array(cols).fill(false)
  const items: Placed[] = []
  const prevHeights = new Array(cols).fill(0)
  const n = posters.length

  posters.forEach((p, i) => {
    const r = rng(hash(p.id))
    // widths: slightly >column width so neighbours overlap a little horizontally
    const wScale = (mobile ? 0.98 : 1.04) + (r() - 0.5) * 0.12
    let w = colW * wScale
    const ratio = p.height / p.width
    let h = w * ratio
    const maxH = mobile ? 520 : 640
    if (h > maxH) { h = maxH; w = h / ratio }
    // pick the column whose last poster ends highest (ties -> lowest index)
    let c = 0
    for (let k = 1; k < cols; k++) if (bottoms[k] < bottoms[c] - 1) c = k
    const cx = pad + colW * c + colW / 2
    const x = cx - w / 2 + (r() - 0.5) * 2 * colW * jitterX
    // Overlap is capped by BOTH neighbours' heights, so a short poster can never be buried under a tall one.
    const prevH = prevHeights[c]
    const ovPx = started[c] ? Math.min(prevH * (overlapY[0] + r() * (overlapY[1] - overlapY[0])), h * 0.22) : 0
    const y = bottoms[c] - ovPx
    const clampedX = Math.min(Math.max(x, 4), boardWidth - w - 4)
    items.push({
      id: p.id, x: clampedX, y, w, h, rot: (r() - 0.5) * 8, // +/-4deg
      z: n - i, pinX: 0.3 + r() * 0.4,
    })
    started[c] = true; prevHeights[c] = h
    bottoms[c] = y + h + (mobile ? 14 : 22)
  })
  return { items, height: Math.max(...bottoms) + 40 }
}
