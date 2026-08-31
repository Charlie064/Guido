import { useEffect } from 'react'
import Landing from './Landing.jsx'
import Pricing from './Pricing.jsx'

// '/login' intentionally not routed yet — glass-waitlist's Login.jsx is
// the pre-ADR-0008 Google OAuth page; see
// docs/planning/glass-waitlist-integration.md. Unmatched paths (including
// '/login' for now) fall through to Landing below.
const TITLES = {
  '/pricing': 'Guido — Pricing',
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  useEffect(() => {
    document.title = TITLES[path] || 'Guido'
  }, [path])

  if (path === '/pricing') return <Pricing />
  return <Landing startWaitlist={path === '/waitlist'} />
}
