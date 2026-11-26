import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { config } from '../config'
import { backend } from '../lib/backend'
import { cleanText } from '../lib/validate'

export default function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [code, setCode] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(() => new URLSearchParams(location.search).get('error') ?? ''); const [info, setInfo] = useState('')
  const [opts, setOpts] = useState<{ google: boolean; demo: boolean }>({ google: false, demo: false })
  useEffect(() => { backend.authOptions().then(setOpts).catch(() => {}) }, [])

  async function send(e?: React.FormEvent) {
    e?.preventDefault(); setErr(''); setInfo('')
    if (mode === 'signup') {
      if (name.trim().length < 2) return setErr('Please enter your name or your group\'s name.')
      if (!agree) return setErr('Please accept the Terms and Conditions to sign up.')
    }
    setBusy(true)
    try {
      await backend.requestCode(email.trim(), { mode, name: cleanText(name, 80) })
      setStep('code'); setInfo(opts.demo ? 'Demo mode: the code is 123456.' : `If that email can sign in, we have sent a 6-digit code to ${email.trim()}. It works for 10 minutes.`)
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    setBusy(true)
    try { await backend.verifyCode(email.trim(), code.trim()); onDone() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  async function google() { try { await backend.signInGoogle() } catch (x) { setErr((x as Error).message) } }

  return (
    <div className="card p-5 sm:p-7 max-w-md mx-auto">
      <div role="tablist" className="grid grid-cols-2 gap-1 bg-brown/10 rounded-xl p-1 mb-5">
        {(['login', 'signup'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setStep('email'); setErr(''); setInfo('') }}
            className={`btn ${mode === m ? 'bg-brown text-cream' : 'bg-transparent text-brown'}`}>{m === 'login' ? 'Log in' : 'Sign up'}</button>
        ))}
      </div>

      {step === 'email' ? (
        <form onSubmit={send} className="space-y-4" noValidate>
          {mode === 'signup' && (
            <div><label className="label" htmlFor="name">Your name or group</label>
              <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          )}
          <div><label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {mode === 'signup' && (
            <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
              <input type="checkbox" className="mt-1 w-6 h-6 accent-[#A85A36] shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="text-[15px]">I accept the <Link to="/terms" target="_blank" className="font-semibold">Terms and Conditions</Link> (version {config.termsVersion}).</span>
            </label>
          )}
          {err && <p role="alert" className="text-[#8a2b1d] font-medium">{err}</p>}
          <button className="btn-primary w-full min-h-[52px] text-lg" disabled={busy}>{busy ? 'Please wait…' : 'Send me a code'}</button>
          <p className="caption">No password to remember: we email you a short code each time.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4" noValidate>
          {info && <p role="status" className="text-rust font-medium">{info}</p>}
          <div><label className="label" htmlFor="code">6-digit code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" className="field text-center tracking-[0.4em] text-2xl font-semibold" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div>
          {err && <p role="alert" className="text-[#8a2b1d] font-medium">{err}</p>}
          <button className="btn-primary w-full min-h-[52px] text-lg" disabled={busy || code.length !== 6}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => { setStep('email'); setCode(''); setErr('') }}>Change email</button>
            <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => send()}>Send a new code</button>
          </div>
        </form>
      )}

      {opts.google && step === 'email' && (<>
        <div className="flex items-center gap-3 my-4 text-brown/60 text-sm"><hr className="flex-1 border-brown/20" />or<hr className="flex-1 border-brown/20" /></div>
        <button className="btn-ghost w-full" onClick={google}>Continue with Google</button>
        {mode === 'signup' && <p className="caption mt-2">With Google you will be asked to accept the Terms before your first post.</p>}
      </>)}
      {mode === 'signup' && <p className="caption mt-3">New organisers are approved by our team before they can post. We'll email you.</p>}
    </div>
  )
}
