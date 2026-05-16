// 세션 유무에 따라 Login 또는 AppShell로 분기하는 최상위 컴포넌트.
import { useAuth } from './lib/useAuth'
import { Login } from './components/Login'
import { AppShell } from './components/AppShell'

function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div style={loadingStyle}>
        <p>로딩…</p>
      </div>
    )
  }

  return session ? <AppShell session={session} /> : <Login />
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0b0d10',
  color: '#9aa3ad',
}

export default App
