import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>(0)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])
  const node = msg ? (
    <div role="status" aria-live="polite" className="fixed left-1/2 -translate-x-1/2 z-[70] bottom-[max(24px,env(safe-area-inset-bottom))] max-w-[90vw] rounded-xl bg-cream text-brown font-medium px-4 py-3 shadow-2xl">
      {msg}
    </div>
  ) : null
  return [node, show] as const
}
