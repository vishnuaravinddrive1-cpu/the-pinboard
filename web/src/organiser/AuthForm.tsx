import { useState } from 'react'
import { Link } from 'react-router-dom'
import { config } from '../config'
import { backend } from '../lib/backend'
import { cleanText } from '../lib/validate'

export default function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [info, setInfo] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setInfo('')
    if (mode === 'signup') {
      if (name.trim().length < 2) return setErr('Please enter your name or your group\'s name.')
      if (password.length < 8) return setErr('Use a password of at least 8 characters.')
      if (!agree) return setErr('Please accept the Terms and Conditions to sign up.')
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const r = await backend.signUp(email.trim(), password, cleanText(name, 80))
        if (r.needsConfirm) { setInfo('Check your email and click the confirmation link, then log in.'); setMode('login'); setBusy(false); return }
      } else await backend.signIn(email.trim(), password)
      onDone()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  async function google() { try { await backend.signInGoogle() } catch (x) { setErr((x as Error).message) } }

  return (
    <div className="card p-5 sm:p-7 max-w-md mx-auto">
      <div role="tablist" className="grid grid-cols-2 gap-1 bg-brown/10 rounded-xl p-1 mb-5">
        {(['login', 'signup'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr('') }}
            className={`btn ${mode === m ? 'bg-brown text-cream' : 'bg-transparent text-brown'}`}>{m === 'login' ? 'Log in' : 'Sign up'}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === 'signup' && (
          <div><label className="label" htmlFor="name">Your name or group</label>
            <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        )}
        <div><label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label" htmlFor="pw">Password</label>
          <input id="pw" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="field" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {mode === 'signup' && (
          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" className="mt-1 w-6 h-6 accent-[#A85A36] shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="text-[15px]">I accept the <Link to="/terms" target="_blank" className="font-semibold">Terms and Conditions</Link> (version {config.termsVersion}).</span>
          </label>
        )}
        {err && <p role="alert" className="text-[#8a2b1d] font-medium">{err}</p>}
        {info && <p role="status" className="text-rust font-medium">{info}</p>}
        <button className="btn-primary w-full min-h-[52px] text-lg" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <div className="flex items-center gap-3 my-4 text-brown/60 text-sm"><hr className="flex-1 border-brown/20" />or<hr className="flex-1 border-brown/20" /></div>
      <button className="btn-ghost w-full" onClick={google}>Continue with Google</button>
      {mode === 'signup' && <p className="caption mt-3">New organisers are approved by our team before they can post. We'll email you.</p>}
    </div>
  )
}
