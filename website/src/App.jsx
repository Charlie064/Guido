import Landing from './Landing.jsx'
import Login from './Login.jsx'
import Pricing from './Pricing.jsx'

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/login') return <Login />
  if (path === '/pricing') return <Pricing />
  return <Landing startWaitlist={path === '/waitlist'} />
}
