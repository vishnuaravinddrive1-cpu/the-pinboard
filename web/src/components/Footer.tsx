import { Link } from 'react-router-dom'
import { config } from '../config'

export default function Footer({ onReport }: { onReport?: () => void }) {
  const link = 'inline-flex items-center min-h-[44px] px-2 font-medium underline-offset-4 hover:underline'
  return (
    <footer className="mx-auto max-w-3xl rounded-2xl bg-cream text-brown px-4 py-3 text-center shadow-xl">
      <nav aria-label="Footer" className="flex flex-wrap justify-center">
        <Link className={link} to="/terms">Terms</Link>
        <Link className={link} to="/privacy">Privacy</Link>
        {onReport && <button className={link} onClick={onReport}>Report this poster</button>}
        <Link className={link} to="/organiser">Organiser login</Link>
      </nav>
      <p className="caption pb-1">A free community service by <a href={config.tcqUrl} target="_blank" rel="noopener noreferrer" className="font-semibold">The Curiosity Quotient</a></p>
    </footer>
  )
}
