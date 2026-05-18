// coins_catalog 검색 헬퍼. HoldingForm 자동완성에서 사용한다.
import { supabase } from './supabase'

export type CoinOption = {
  coingeckoId: string
  symbol: string
  name: string
  marketCapRank: number | null
}

const TOP_LIMIT = 30
const SEARCH_LIMIT = 30

export async function fetchTopCoins(limit = TOP_LIMIT): Promise<CoinOption[]> {
  const { data, error } = await supabase
    .from('coins_catalog')
    .select('coingecko_id, symbol, name, market_cap_rank')
    .order('market_cap_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toOption)
}

export async function searchCoins(query: string, limit = SEARCH_LIMIT): Promise<CoinOption[]> {
  const q = query.trim()
  if (!q) return fetchTopCoins(limit)
  // symbol 또는 name에 부분 일치(ilike). rank 정렬로 상위 노출.
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
  const { data, error } = await supabase
    .from('coins_catalog')
    .select('coingecko_id, symbol, name, market_cap_rank')
    .or(`symbol.ilike.${like},name.ilike.${like}`)
    .order('market_cap_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toOption)
}

function toOption(row: {
  coingecko_id: string
  symbol: string
  name: string
  market_cap_rank: number | null
}): CoinOption {
  return {
    coingeckoId: row.coingecko_id,
    symbol: row.symbol,
    name: row.name,
    marketCapRank: row.market_cap_rank,
  }
}
