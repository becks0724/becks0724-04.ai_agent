// 영문 뉴스 제목을 한글로 번역. MyMemory 무료 API + localStorage 캐싱.
// 키 불필요, IP당 일 5000 단어 한도. 동일 텍스트는 영구 캐시 적중.
const CACHE_PREFIX = 'tr:en-ko:v1:'
const API = 'https://api.mymemory.translated.net/get'

// 동일 텍스트에 대한 중복 in-flight 호출 방지 (마운트 직후 동시 60건 호출 회피).
const inflight = new Map<string, Promise<string | null>>()

export function getCachedTranslation(text: string): string | null {
  if (!text) return null
  try {
    return localStorage.getItem(CACHE_PREFIX + text)
  } catch {
    return null
  }
}

export async function translateToKo(text: string): Promise<string | null> {
  if (!text) return null
  const cached = getCachedTranslation(text)
  if (cached) return cached

  const existing = inflight.get(text)
  if (existing) return existing

  const promise = (async () => {
    try {
      const url = `${API}?q=${encodeURIComponent(text)}&langpair=en|ko`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = (await res.json()) as {
        responseStatus?: number | string
        responseData?: { translatedText?: string }
      }
      const status = Number(data.responseStatus ?? 0)
      const ko = (data.responseData?.translatedText ?? '').trim()
      // 너무 짧거나 영문 그대로 반환된 경우(번역 실패 후 원문 echo) 캐시하지 않음.
      if (status === 200 && ko && ko.toLowerCase() !== text.toLowerCase()) {
        try {
          localStorage.setItem(CACHE_PREFIX + text, ko)
        } catch {
          // 쿼터 초과 등 — silent
        }
        return ko
      }
      return null
    } catch {
      return null
    } finally {
      inflight.delete(text)
    }
  })()
  inflight.set(text, promise)
  return promise
}
