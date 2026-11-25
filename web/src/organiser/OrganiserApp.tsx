import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '../pages/Static'
import { config } from '../config'
import { backend } from '../lib/backend'
import type { Poster, SessionUser } from '../lib/types'
import AuthForm from './AuthForm'
import PosterList from './PosterList'
import UploadForm from './UploadForm'

export default function OrganiserApp() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [posters, setPosters] = useState<Poster[]>([])
  const [view, setView] = useState<'list' | 'new'>('list')
  const [err, setErr] = useState('')

  const refreshUser = useCallback(() => { backend.getUser().then(setUser).catch(() => setUser(null)) }, [])
  useEffect(() => { refreshUser(); return backend.onAuthChange(refreshUser) }, [refreshUser])
  const reload = useCallback(() => { backend.myPosters().then(setPosters).catch((e) => setErr(e.message)) }, [])
  const approvedId = user?.status === 'approved' ? user.id : null
  useEffect(() => { if (approvedId) reload() }, [approvedId, reload])

  if (user === undefined) return <PageShell title="Organiser"><p role="status">Loading…</p></PageShell>
  if (!user) return <PageShell title="Organiser area"><p className="mb-4 caption">Post your event poster on the Chennai Pin Board, free.</p><AuthForm onDone={refreshUser} /></PageShell>

  const bar = (
    <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <p className="font-medium">Hi, {user.display_name}</p>
      <div className="flex gap-2">
        {user.role === 'admin' && <Link to="/admin" className="btn-secondary no-underline">Admin</Link>}
        <button className="btn-ghost" onClick={() => backend.signOut().then(refreshUser)}>Log out</button>
      </div>
    </div>
  )

  if (user.status !== 'approved') {
    const m = {
      pending: ['Pending approval', 'Thanks for signing up! Our team reviews every new organiser. We will email you as soon as you are approved. You cannot post until then.'],
      rejected: ['Not approved', `Sorry, your account was not approved. Write to ${config.operator.contact} if you think this is a mistake.`],
      suspended: ['Account suspended', `Your account is suspended. Write to ${config.operator.contact} to find out why.`],
    }[user.status as 'pending' | 'rejected' | 'suspended']
    return <PageShell title={m[0]}>{bar}<p className="card !bg-peach/40 p-4" role="status">{m[1]}</p></PageShell>
  }

  if (user.terms_version !== config.termsVersion) {
    return (
      <PageShell title="Please accept the Terms">
        {bar}
        <p className="mb-4">{user.terms_version ? 'Our Terms have been updated (version ' + config.termsVersion + ').' : 'Before you post, please read and accept the Terms.'} <Link to="/terms" target="_blank">Read the Terms</Link></p>
        <button className="btn-primary" onClick={() => backend.acceptTerms().then(refreshUser)}>I accept the Terms (version {config.termsVersion})</button>
      </PageShell>
    )
  }

  return (
    <PageShell title={view === 'new' ? 'New poster' : 'My posters'} wide>
      {bar}
      {err && <p role="alert" className="text-[#8a2b1d] font-medium mb-3">{err}</p>}
      {view === 'new'
        ? <UploadForm onDone={() => { reload(); setView('list') }} onCancel={() => setView('list')} />
        : (<>
          <button className="btn-primary w-full sm:w-auto mb-4 min-h-[52px] text-lg" onClick={() => setView('new')}>+ New poster</button>
          <PosterList posters={posters} reload={reload} />
        </>)}
    </PageShell>
  )
}
