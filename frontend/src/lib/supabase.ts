// Supabase 클라이언트 싱글톤. anon(publishable) 키만 사용한다. service_role 금지.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // 빌드 산출물에 값이 비어있으면 즉시 콘솔에 띄운다 (런타임 디버깅용).
  // 보안상 어차피 publishable 키라 키 누출 위험은 없다.
  console.error('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 비어 있다.')
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
