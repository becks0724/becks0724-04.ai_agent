// Supabase PostgrestError는 Error 인스턴스가 아니라 일반 객체다.
// String(err)이 '[object Object]'가 되지 않도록 안전하게 message/code를 뽑아주는 헬퍼.

export type NormalizedError = {
  message: string
  code: string | null
}

export function normalizeError(e: unknown): NormalizedError {
  if (e instanceof Error) return { message: e.message, code: null }
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const message =
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.details === 'string' && obj.details) ||
      (typeof obj.hint === 'string' && obj.hint) ||
      JSON.stringify(obj)
    const code = typeof obj.code === 'string' ? obj.code : null
    return { message, code }
  }
  return { message: String(e), code: null }
}
