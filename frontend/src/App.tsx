// 세션 유무에 따라 Login 또는 AppShell로 분기하는 최상위 컴포넌트.
import { useAuth } from './lib/useAuth'
import { Login } from './components/Login'
import { AppShell } from './components/AppShell'

function App() {
  const { session, loading, error } = useAuth()

  if (loading) {
    return (
      <div style={loadingStyle}>
        <p>로딩…</p>
      </div>
    )
  }

  if (error && !session) {
    // 세션 복구에 실패했고 로그인도 안 된 상태. 디버깅 메시지 노출 후 로그인 화면 안내.
    return (
      <div style={loadingStyle}>
        <p style={{ color: '#cf202f' }}>세션 로딩 오류: {error}</p>
        <Login />
      </div>
    )
  }

  return session ? <AppShell /> : <Login />
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#ffffff',
  color: '#5b616e',
  gap: '12px',
}

export default App
