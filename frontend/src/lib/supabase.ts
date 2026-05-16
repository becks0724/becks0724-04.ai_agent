// Supabase 클라이언트 싱글톤. anon(publishable) 키만 사용한다. service_role 금지.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // 빌드 산출물이 환경변수 없이 배포된 경우, silent fail 대신 즉시 던져
  // "검은 화면"이 아니라 명시적 오류 메시지가 콘솔에 보이게 한다.
  throw new Error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 비어 있다. ' +
      'Vercel Project Settings → Environment Variables를 확인해라.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
