import Landing from './Landing.jsx'
import Login from './Login.jsx'

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/login') return <Login />
  return <Landing startWaitlist={path === '/waitlist'} />
}
