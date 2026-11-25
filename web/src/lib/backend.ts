import { demoMode } from '../config'
import { demoBackend } from './demoBackend'
import type { Backend } from './types'

/** Supabase code is only downloaded when real credentials exist. */
const impl: Promise<Backend> = demoMode ? Promise.resolve(demoBackend) : import('./supabaseBackend').then((m) => m.supabaseBackend)

export const backend: Backend = new Proxy({} as Backend, {
  get(_t, key: string) {
    if (key === 'onAuthChange') {
      return (cb: () => void) => {
        let off = () => {}
        let dead = false
        impl.then((b) => { if (!dead) off = b.onAuthChange(cb) })
        return () => { dead = true; off() }
      }
    }
    return async (...args: unknown[]) => ((await impl) as any)[key](...args)
  },
})
