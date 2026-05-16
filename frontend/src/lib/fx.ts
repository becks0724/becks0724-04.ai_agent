// USD/KRW 환율 조회 헬퍼. Frankfurter 우선, 실패 시 open.er-api.com 폴백.
// 두 곳 모두 무료 + API 키 불필요.

export type UsdKrwRate = {
  rate: number      // 1 USD = N KRW
  asOf: string      // YYYY-MM-DD (또는 ISO)
  fetchedAt: number // epoch ms
  source: 'frankfurter' | 'open.er-api'
}

async function tryFrankfurter(): Promise<UsdKrwRate> {
  // api.frankfurter.app은 .dev로 이전(301 리다이렉트)되어 브라우저 fetch에서
  // cross-origin redirect로 CORS가 깨진다. .dev 도메인을 직접 호출한다.
  const resp = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=KRW')
  if (!resp.ok) throw new Error(`frankfurter HTTP ${resp.status}`)
  const data = await resp.json()
  const rate = data?.rates?.KRW
  const asOf = data?.date
  if (typeof rate !== 'number' || !asOf) throw new Error('frankfurter 응답 형식 비정상')
  return { rate, asOf, fetchedAt: Date.now(), source: 'frankfurter' }
}

async function tryOpenErApi(): Promise<UsdKrwRate> {
  const resp = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!resp.ok) throw new Error(`open.er-api HTTP ${resp.status}`)
  const data = await resp.json()
  const rate = data?.rates?.KRW
  const asOf =
    data?.time_last_update_utc ??
    (typeof data?.time_last_update_unix === 'number'
      ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
      : null)
  if (typeof rate !== 'number' || !asOf) throw new Error('open.er-api 응답 형식 비정상')
  return { rate, asOf, fetchedAt: Date.now(), source: 'open.er-api' }
}

export async function fetchUsdKrw(): Promise<UsdKrwRate> {
  // 첫 번째 시도 — ECB 기반 신뢰도 높음.
  try {
    return await tryFrankfurter()
  } catch (e1) {
    console.warn('[fx] frankfurter 실패, open.er-api로 폴백', e1)
    try {
      return await tryOpenErApi()
    } catch (e2) {
      const m1 = e1 instanceof Error ? e1.message : String(e1)
      const m2 = e2 instanceof Error ? e2.message : String(e2)
      throw new Error(`환율 API 모두 실패. frankfurter: ${m1} / open.er-api: ${m2}`)
    }
  }
}
