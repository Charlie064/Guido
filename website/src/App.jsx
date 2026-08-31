import { useEffect } from 'react'
import Landing from './Landing.jsx'
import Login from './Login.jsx'
import Pricing from './Pricing.jsx'

const TITLES = {
  '/login': 'Guido — Sign in',
  '/pricing': 'Guido — Pricing',
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  useEffect(() => {
    document.title = TITLES[path] || 'Guido'
  }, [path])

  if (path === '/login') return <Login />
  if (path === '/pricing') return <Pricing />
  return <Landing startWaitlist={path === '/waitlist'} />
}
