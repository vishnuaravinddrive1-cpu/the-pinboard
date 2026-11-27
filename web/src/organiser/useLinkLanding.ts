import { useEffect, useState } from 'react'
import { backend } from '../lib/backend'

/**
 * Handles the two special addresses:  /organiser?link=TOKEN  (personal sign-in link from the admin's email)
 * and /organiser?setup=KEY (first-time admin set-up). The token is removed from the address bar right away.
 */
export function useLinkLanding(onSignedIn: () => void) {
  const [busy, setBusy] = useState(() => /[?&](link|setup)=/.test(location.search))
  const [error, setError] = useState('')
  const [adminLink, setAdminLink] = useState('')
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const link = q.get('link'), setup = q.get('setup')
    if (!link && !setup) return
    history.replaceState(null, '', location.pathname)
    const run = setup ? backend.setupAdmin(setup).then((r) => setAdminLink(r.link)) : backend.useLink(link!)
    run.then(onSignedIn).catch((e) => setError((e as Error).message)).finally(() => setBusy(false))
  }, [])
  return { busy, error, adminLink, clearAdminLink: () => setAdminLink('') }
}
