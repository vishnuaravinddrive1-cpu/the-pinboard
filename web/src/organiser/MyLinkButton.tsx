import { useState } from 'react'
import { backend } from '../lib/backend'
import CopyButton from '../components/CopyButton'

/** "My sign-in link": a personal link to open on another phone or computer. */
export default function MyLinkButton() {
  const [url, setUrl] = useState(''); const [err, setErr] = useState('')
  async function open() { setErr(''); try { setUrl(await backend.myLink()) } catch (x) { setErr((x as Error).message) } }
  return (
    <>
      <button className="btn-ghost" onClick={open}>My sign-in link</button>
      {(url || err) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={() => { setUrl(''); setErr('') }}>
          <div role="dialog" aria-modal="true" aria-label="My sign-in link" onClick={(e) => e.stopPropagation()} className="card w-full sm:max-w-md p-5 space-y-3 safe-bottom rounded-b-none sm:rounded-b-2xl">
            <h2 className="text-xl font-bold">My sign-in link</h2>
            {err ? <p role="alert" className="text-[#8a2b1d]">{err}</p> : <>
              <p className="text-[15px]">Open this link on another phone or computer to sign in there. Keep it private: anyone who has it can sign in as you.</p>
              <p className="rounded-lg bg-brown/10 p-2 text-sm break-all select-all" data-testid="my-link">{url}</p>
              <CopyButton text={url} label="Copy link" />
            </>}
            <div className="flex justify-end"><button className="btn-ghost" onClick={() => { setUrl(''); setErr('') }}>Close</button></div>
          </div>
        </div>
      )}
    </>
  )
}
