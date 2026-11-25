import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Board from './board/Board'

const Organiser = lazy(() => import('./organiser/OrganiserApp'))
const Admin = lazy(() => import('./admin/AdminApp'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))

const Fallback = () => <div className="min-h-[100dvh] cork grid place-items-center text-cream font-semibold" role="status">Loading…</div>

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/organiser/*" element={<Organiser />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Board />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
