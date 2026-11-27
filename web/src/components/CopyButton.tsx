import { useState } from 'react'

/** Copies text to the clipboard and says so. Falls back to selecting the text when the clipboard is blocked. */
export default function CopyButton({ text, label = 'Copy', className = 'btn-secondary' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) }
    catch { window.prompt('Copy this text:', text) }
  }
  return <button type="button" className={`${className} !min-h-[44px] !px-3 text-sm`} onClick={copy}>{done ? 'Copied ✓' : label}</button>
}
