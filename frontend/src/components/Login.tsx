// Google OAuth 기반 로그인 화면. 첫 동의 후 재방문 시 자동 로그인(refresh token).
import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Status =
  | { kind: 'idle' }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string }

export function Login() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const signInWithGoogle = async () => {
    setStatus({ kind: 'redirecting' })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // 같은 세션에서도 항상 Google 계정 선택 화면을 보여준다(원치 않으면 제거).
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) {
      setStatus({ kind: 'error', message: error.message })
    }
    // 성공이면 Google 동의 화면으로 redirect되어 본 컴포넌트는 unmount된다.
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.brand}>crypto-monitoring</div>
        <h1 style={styles.title}>Sign in</h1>
        <p style={styles.sub}>
          Google 계정으로 1클릭 로그인. 첫 로그인 시 한 번만 동의하면 그 후로는 자동으로 로그인된다.
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={status.kind === 'redirecting'}
          style={{
            ...styles.googleButton,
            ...(status.kind === 'redirecting' ? styles.buttonDisabled : {}),
          }}
        >
          <GoogleGlyph />
          <span>{status.kind === 'redirecting' ? 'Google로 이동 중…' : 'Google로 계속하기'}</span>
        </button>

        {status.kind === 'error' && (
          <p style={styles.error}>오류: {status.message}</p>
        )}
      </div>
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
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
  googleButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px 20px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '100px',
    color: '#0a0b0d',
    fontWeight: 600,
    fontSize: '16px',
    height: '48px',
    cursor: 'pointer',
  },
  buttonDisabled: {
    background: '#f7f7f7',
    color: '#5b616e',
    cursor: 'not-allowed',
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
