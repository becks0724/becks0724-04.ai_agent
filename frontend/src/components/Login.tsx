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
        <div style={styles.brand}>crypto-monitoring</div>
        <h1 style={styles.title}>Sign in</h1>
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
            style={{
              ...styles.button,
              ...(status.kind === 'sending' ? styles.buttonDisabled : {}),
            }}
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
    background: '#ffffff',
    color: '#0a0b0d',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px 32px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
  },
  brand: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#0052ff',
    letterSpacing: 0,
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    fontSize: '36px',
    fontWeight: 400,
    lineHeight: 1.11,
    letterSpacing: '-0.5px',
    color: '#0a0b0d',
  },
  sub: {
    marginTop: '12px',
    marginBottom: '32px',
    color: '#5b616e',
    fontSize: '16px',
    lineHeight: 1.5,
  },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '14px', color: '#0a0b0d', fontWeight: 500 },
  input: {
    padding: '14px 16px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '12px',
    color: '#0a0b0d',
    fontSize: '16px',
    height: '48px',
  },
  button: {
    marginTop: '8px',
    padding: '12px 20px',
    background: '#0052ff',
    border: 'none',
    borderRadius: '100px',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '16px',
    height: '48px',
    cursor: 'pointer',
  },
  buttonDisabled: {
    background: '#a8b8cc',
    cursor: 'not-allowed',
  },
  success: {
    marginTop: '20px',
    padding: '14px 16px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '12px',
    color: '#05b169',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  error: {
    marginTop: '20px',
    padding: '14px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    color: '#cf202f',
    fontSize: '14px',
  },
}
