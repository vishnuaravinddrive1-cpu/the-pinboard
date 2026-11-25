import { Link } from 'react-router-dom'
import LogoChip from '../components/LogoChip'
import Footer from '../components/Footer'

export function PageShell({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-[100dvh] cork flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 safe-top pb-2">
        <Link to="/" className="rounded-xl bg-cream shadow-lg px-3 min-h-[44px] flex items-center font-bold text-lg text-brown no-underline">Pin Board</Link>
        <LogoChip />
      </header>
      <main className={`flex-1 w-full mx-auto px-3 sm:px-6 py-4 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="card p-5 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-4">{title}</h1>{children}</div>
      </main>
      <div className="px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-4"><Footer /></div>
    </div>
  )
}
