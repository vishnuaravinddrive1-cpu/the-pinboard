/** Strip control characters / angle brackets, collapse whitespace, cap length. React escapes output; this is belt and braces. */
 
export function cleanText(s: string, max = 120): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Returns a normalised https URL, '' for empty, or null if invalid. */
export function cleanHttpsUrl(s: string): string | null {
  const t = s.trim()
  if (!t) return ''
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function hostOf(url: string | null): string {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' }
}
