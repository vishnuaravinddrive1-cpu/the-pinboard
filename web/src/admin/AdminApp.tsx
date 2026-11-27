import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthForm from '../organiser/AuthForm'
import { PageShell } from '../pages/Static'
import { backend } from '../lib/backend'
import type { SessionUser } from '../lib/types'
import Dashboard from './Dashboard'
import MyLinkButton from '../organiser/MyLinkButton'

const PostersTab = lazy(() => import('./PostersTab'))
const OrganisersTab = lazy(() => import('./OrganisersTab'))
const Misc = {
  reports: lazy(() => import('./MiscTabs').then((m) => ({ default: m.ReportsTab }))),
  outbox: lazy(() => import('./OutboxTab')),
  log: lazy(() => import('./MiscTabs').then((m) => ({ default: m.LogTab }))),
  settings: lazy(() => import('./MiscTabs').then((m) => ({ default: m.SettingsTab }))),
}
const TABS = [['dashboard', 'Dashboard'], ['posters', 'Posters'], ['organisers', 'Organisers'], ['reports', 'Reports'], ['outbox', 'Outbox'], ['log', 'Activity'], ['settings', 'Settings']] as const
type Tab = (typeof TABS)[number][0]

export default function AdminApp() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [outbox, setOutbox] = useState(0)
  const refresh = useCallback(() => { backend.getUser().then(setUser).catch(() => setUser(null)) }, [])
  useEffect(() => { refresh(); return backend.onAuthChange(refresh) }, [refresh])

  useEffect(() => { if (user?.role === 'admin') backend.adminStats().then((x) => setOutbox(x.outbox)).catch(() => {}) }, [user, tab])

  if (user === undefined) return <PageShell title="Admin"><p role="status">Loading…</p></PageShell>
  if (!user) return <PageShell title="Admin login"><AuthForm onDone={refresh} adminArea /></PageShell>
  if (user.role !== 'admin') return <PageShell title="Admins only"><p className="mb-3">This area is only for Pin Board admins.</p><Link to="/organiser" className="btn-secondary no-underline">Go to organiser area</Link></PageShell>

  return (
    <PageShell title="Admin console" wide>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="caption">{user.email}</p>
        <div className="flex gap-2"><MyLinkButton /><button className="btn-ghost" onClick={() => backend.signOut().then(refresh)}>Log out</button></div>
      </div>
      <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto pb-2 mb-4 -mx-1 px-1" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`btn shrink-0 ${tab === k ? 'bg-brown text-cream' : 'bg-brown/10 text-brown'}`}>{l}{k === 'outbox' && outbox > 0 ? ` (${outbox})` : ''}</button>))}
      </nav>
      <Suspense fallback={<p role="status">Loading…</p>}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'posters' && <PostersTab />}
        {tab === 'organisers' && <OrganisersTab />}
        {tab === 'reports' && <Misc.reports />}
        {tab === 'outbox' && <Misc.outbox onChanged={(n: number) => setOutbox(n)} />}
        {tab === 'log' && <Misc.log />}
        {tab === 'settings' && <Misc.settings />}
      </Suspense>
    </PageShell>
  )
}
