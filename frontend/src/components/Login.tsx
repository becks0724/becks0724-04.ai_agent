// Magic Link 기반 로그인 폼. 이메일 입력 → Supabase가 로그인 링크 발송.
import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string }

export function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setStatus({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) {
      setStatus({ kind: 'error', message: error.message })
      return
    }
    setStatus({ kind: 'sent', email: trimmed })
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.title}>crypto-monitoring</h1>
        <p style={styles.sub}>이메일로 로그인 링크를 받는다. 비밀번호 없음.</p>

        <form onSubmit={submit} style={styles.form}>
          <label htmlFor="email" style={styles.label}>이메일</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={styles.input}
            disabled={status.kind === 'sending'}
          />
          <button
            type="submit"
            style={styles.button}
            disabled={status.kind === 'sending'}
          >
            {status.kind === 'sending' ? '발송 중…' : '매직링크 받기'}
          </button>
        </form>

        {status.kind === 'sent' && (
          <p style={styles.success}>
            <strong>{status.email}</strong>로 로그인 링크를 보냈다.
            메일함을 확인하고 링크를 클릭하면 로그인된다.
          </p>
        )}
        {status.kind === 'error' && (
          <p style={styles.error}>오류: {status.message}</p>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#0b0d10',
    color: '#e6e8eb',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    padding: '28px',
    background: '#15181c',
    borderRadius: '12px',
    boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 700 },
  sub: { marginTop: '6px', marginBottom: '20px', color: '#9aa3ad', fontSize: '13px' },
  form: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '12px', color: '#9aa3ad' },
  input: {
    padding: '10px 12px',
    background: '#0b0d10',
    border: '1px solid #2a2f36',
    borderRadius: '8px',
    color: '#e6e8eb',
    fontSize: '14px',
    outline: 'none',
  },
  button: {
    marginTop: '8px',
    padding: '10px 12px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  success: {
    marginTop: '16px',
    padding: '10px 12px',
    background: '#0f2a1a',
    border: '1px solid #1f6b3a',
    borderRadius: '8px',
    color: '#a7f3c8',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  error: {
    marginTop: '16px',
    padding: '10px 12px',
    background: '#2a1212',
    border: '1px solid #6b1f1f',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '13px',
  },
}
