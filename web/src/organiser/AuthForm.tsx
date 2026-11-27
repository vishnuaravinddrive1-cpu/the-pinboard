import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { config } from '../config'
import { backend } from '../lib/backend'
import { cleanText } from '../lib/validate'

/** No passwords, no automatic email. New organisers ask for access; approved ones use the personal link the admin emailed. */
export default function AuthForm({ onDone, adminArea = false, notice = '' }: { onDone: () => void; adminArea?: boolean; notice?: string }) {
  const [mode, setMode] = useState<'login' | 'access'>('login')
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(() => notice || new URLSearchParams(location.search).get('error') || ''); const [info, setInfo] = useState('')
  const [lost, setLost] = useState(false)
  const [opts, setOpts] = useState<{ google: boolean; demo: boolean }>({ google: false, demo: false })
  useEffect(() => { backend.authOptions().then(setOpts).catch(() => {}) }, [])

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setInfo('')
    if (name.trim().length < 2) return setErr("Please enter your name or your group's name.")
    if (!agree) return setErr('Please accept the Terms and Conditions to request access.')
    setBusy(true)
    try {
      await backend.requestAccess(email.trim(), cleanText(name, 80))
      setInfo('Thank you! Your request is with our team. When you are approved we will email you a personal sign-in link. Until then you cannot post.')
      setName(''); setEmail(''); setAgree(false)
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  async function askLink(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true)
    try { await backend.requestLink(email.trim()); setInfo('If that email belongs to an approved organiser, a new sign-in link is on its way. We send these by hand, so it may take a little while.') }
    catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  async function demo(addr: string) { try { await backend.demoLogin!(addr); onDone() } catch (x) { setErr((x as Error).message) } }
  async function google() { try { await backend.signInGoogle() } catch (x) { setErr((x as Error).message) } }

  return (
    <div className="card p-5 sm:p-7 max-w-md mx-auto">
      {!adminArea && (
        <div role="tablist" className="grid grid-cols-2 gap-1 bg-brown/10 rounded-xl p-1 mb-5">
          {(['login', 'access'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(''); setInfo('') }}
              className={`btn ${mode === m ? 'bg-brown text-cream' : 'bg-transparent text-brown'}`}>{m === 'login' ? 'Log in' : 'Request access'}</button>
          ))}
        </div>
      )}
      {err && <p role="alert" className="text-[#8a2b1d] font-medium mb-3">{err}</p>}
      {info && <p role="status" className="rounded-xl bg-peach/50 p-3 font-medium mb-3">{info}</p>}

      {(mode === 'login' || adminArea) && (
        <div className="space-y-4">
          <p className="text-[15px]">Approved organisers sign in with the <strong className="font-semibold">personal sign-in link</strong> we emailed them. Open that link on this phone or computer and you are in; you stay signed in for about a month.</p>
          {opts.google && <button className="btn-secondary w-full" onClick={google}>Continue with Google</button>}
          {opts.demo && (
            <div className="rounded-xl border-2 border-dashed border-terracotta p-3 space-y-2" data-testid="demo-logins">
              <p className="caption">Demo mode: pick an account to try.</p>
              <DemoButtons onPick={demo} />
            </div>
          )}
          <button type="button" className="btn-ghost w-full" aria-expanded={lost} onClick={() => setLost(!lost)}>Lost your link?</button>
          {lost && (
            <form onSubmit={askLink} className="space-y-3">
              <div><label className="label" htmlFor="lost-email">Your email</label>
                <input id="lost-email" type="email" inputMode="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : 'Ask for a new link'}</button>
            </form>
          )}
        </div>
      )}

      {mode === 'access' && !adminArea && (
        <form onSubmit={requestAccess} className="space-y-4" noValidate>
          <div><label className="label" htmlFor="name">Your name or group</label>
            <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" className="mt-1 w-6 h-6 accent-[#A85A36] shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="text-[15px]">I accept the <Link to="/terms" target="_blank" className="font-semibold">Terms and Conditions</Link> (version {config.termsVersion}).</span>
          </label>
          <button className="btn-primary w-full min-h-[52px] text-lg" disabled={busy}>{busy ? 'Please wait…' : 'Request access'}</button>
          <p className="caption">New organisers are approved by our team before they can post. We will email you a personal sign-in link.</p>
        </form>
      )}
    </div>
  )
}

function DemoButtons({ onPick }: { onPick: (email: string) => void }) {
  const accounts = ['organiser@demo.test', 'newbie@demo.test', 'suspended@demo.test', 'admin@demo.test']
  return <div className="grid gap-2">{accounts.map((a) => <button key={a} className="btn-ghost !justify-start" onClick={() => onPick(a)}>Demo: {a}</button>)}</div>
}
