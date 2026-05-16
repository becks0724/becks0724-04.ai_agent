// 앱 전체에 세션·로딩·에러 상태를 공급하는 Auth Context Provider + 소비 훅.
// session prop drilling을 제거하고 자식 컴포넌트가 useAuth()로 직접 접근하게 한다.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  error: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data, error: err }) => {
        if (!mounted) return
        if (err) setError(err.message)
        setSession(data.session)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!mounted) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return
      setSession(next)
      // 세션 상태가 바뀌면 직전 에러는 더 이상 유효하지 않다.
      setError(null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(() => {
    return {
      session,
      user: session?.user ?? null,
      loading,
      error,
      signOut: async () => {
        const { error: err } = await supabase.auth.signOut()
        if (err) setError(err.message)
      },
    }
  }, [session, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // Provider 누락 시 즉시 실패. silent null 반환은 디버깅을 어렵게 한다.
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
