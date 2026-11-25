let last: { id: string; t: number } | null = null
/** True when this is the second tap/click on the same poster within the double-tap window. */
export function isDoubleTap(id: string, windowMs = 340): boolean {
  const now = performance.now()
  const dbl = !!last && last.id === id && now - last.t < windowMs
  last = dbl ? null : { id, t: now }
  return dbl
}
export function resetTaps() { last = null }
let lastBook = -Infinity
export function bookingDebounced(): boolean {
  const now = performance.now()
  if (now - lastBook < 700) return false
  lastBook = now
  return true
}
