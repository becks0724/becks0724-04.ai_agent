// price_snapshots에서 입력 심볼들의 가장 최근 가격 1건씩 모아 반환한다.
import { supabase } from './supabase'

export type PriceSnapshot = {
  symbol: string
  price_usd: number
  fetched_at: string
}

export async function fetchLatestPrices(
  symbols: string[],
): Promise<Map<string, PriceSnapshot>> {
  const out = new Map<string, PriceSnapshot>()
  if (symbols.length === 0) return out

  // Supabase는 DISTINCT ON 직접 지원이 없어 fetched_at desc로 가져와 클라이언트에서 dedupe.
  // 50 * 심볼수면 충분 (30초 폴링 기준 약 25분치 히스토리).
  const { data, error } = await supabase
    .from('price_snapshots')
    .select('symbol, price_usd, fetched_at')
    .in('symbol', symbols)
    .order('fetched_at', { ascending: false })
    .limit(symbols.length * 50)

  if (error) throw error

  for (const row of (data ?? []) as PriceSnapshot[]) {
    if (!out.has(row.symbol)) out.set(row.symbol, row)
  }
  return out
}
