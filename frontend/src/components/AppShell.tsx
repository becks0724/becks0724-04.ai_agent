// 로그인 후 표시되는 상단 헤더 + 빈 본문 골격. Stage 1-C 조각 2/3에서 채워진다.
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Props = { session: Session }

export function AppShell({ session }: Props) {
  const email = session.user.email ?? '익명'
  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <div style={styles.brand}>crypto-monitoring</div>
        <div style={styles.right}>
          <span style={styles.email}>{email}</span>
          <button
            type="button"
            style={styles.logout}
            onClick={() => supabase.auth.signOut()}
          >
            로그아웃
          </button>
        </div>
      </header>
      <main style={styles.main}>
        <p style={styles.placeholder}>
          로그인 성공. 포트폴리오 CRUD UI는 Stage 1-C 조각 2에서 추가된다.
        </p>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#0b0d10', color: '#e6e8eb' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid #1c1f24',
  },
  brand: { fontWeight: 700 },
  right: { display: 'flex', alignItems: 'center', gap: '12px' },
  email: { color: '#9aa3ad', fontSize: '13px' },
  logout: {
    padding: '6px 10px',
    background: 'transparent',
    border: '1px solid #2a2f36',
    borderRadius: '6px',
    color: '#e6e8eb',
    cursor: 'pointer',
    fontSize: '13px',
  },
  main: { padding: '32px 20px', maxWidth: '960px', margin: '0 auto' },
  placeholder: { color: '#9aa3ad' },
}
