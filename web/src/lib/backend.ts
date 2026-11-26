import { apiBackend } from './apiBackend'
import { demoBackend } from './demoBackend'
import type { Backend } from './types'

/**
 * Decides once per page load: if the Pin Board API answers on this origin, use it; if the site is served on its own
 * (npm run dev, a static preview) there is no API and the in-browser demo is used. A network ERROR never silently
 * falls back to demo data: that would show visitors fake posters.
 */
async function detect(): Promise<Backend> {
  let res: Response
  try { res = await fetch('/api/config', { cache: 'no-store' }) } catch { throw new Error('Cannot reach Pin Board. Please check your connection and reload.') }
  if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
    const j = await res.json().catch(() => null)
    if (j?.service === 'pinboard') return apiBackend
  }
  if (res.status >= 500) throw new Error('Pin Board is having trouble right now. Please try again in a minute.')
  return demoBackend
}
let impl: Promise<Backend> | null = null
const pick = () => (impl ??= detect().catch((e) => { impl = null; throw e }))

export const backend: Backend = new Proxy({} as Backend, {
  get(_t, key: string) {
    if (key === 'onAuthChange') {
      return (cb: () => void) => {
        let off = () => {}; let dead = false
        pick().then((b) => { if (!dead) off = b.onAuthChange(cb) }).catch(() => {})
        return () => { dead = true; off() }
      }
    }
    return async (...args: unknown[]) => ((await pick()) as any)[key](...args)
  },
})
