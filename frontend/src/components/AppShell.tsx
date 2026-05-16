// 로그인 후 표시되는 헤더 + 포트폴리오 등록 폼 + 보유 목록.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { listHoldings } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import { normalizeError } from '../lib/errors'
import { HoldingForm } from './HoldingForm'
import { HoldingsList } from './HoldingsList'

type Props = { session: Session }

export function AppShell({ session }: Props) {
  const email = session.user.email ?? '익명'
  const userId = session.user.id

  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    listHoldings()
      .then((rows) => {
        if (!mounted) return
        setHoldings(rows)
        setLoadError(null)
      })
      .catch((e) => {
        if (!mounted) return
        setLoadError(normalizeError(e).message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

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
        <h2 style={styles.sectionTitle}>포트폴리오</h2>
        <HoldingForm
          userId={userId}
          onCreated={(h) => setHoldings((prev) => [...prev, h])}
        />
        {loading && <p style={styles.muted}>불러오는 중…</p>}
        {loadError && <p style={styles.error}>목록 로딩 오류: {loadError}</p>}
        {!loading && !loadError && (
          <HoldingsList holdings={holdings} onChanged={setHoldings} />
        )}
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
  main: { padding: '24px 20px', maxWidth: '960px', margin: '0 auto' },
  sectionTitle: { margin: '4px 0 14px', fontSize: '16px', fontWeight: 600 },
  muted: { color: '#9aa3ad', fontSize: '14px' },
  error: {
    padding: '8px 10px',
    background: '#2a1212',
    border: '1px solid #6b1f1f',
    borderRadius: '6px',
    color: '#fca5a5',
    fontSize: '13px',
  },
}
