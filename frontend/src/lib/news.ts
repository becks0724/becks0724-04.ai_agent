// Supabase news / news_ticker_map 테이블에서 보유 종목 또는 전체 최신 뉴스를 조회하는 헬퍼.
import { supabase } from './supabase'

export type NewsItem = {
  id: number
  source: string
  title: string
  url: string
  publishedAt: string | null
}

export async function fetchLatestNews(limit = 20): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('news')
    .select('id, source, title, url, published_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toItem)
}

export async function fetchNewsForSymbols(symbols: string[], limit = 20): Promise<NewsItem[]> {
  if (symbols.length === 0) return []

  // 1) symbol → news_id 후보 집합 수집 (중복 가능)
  const { data: mapRows, error: mapErr } = await supabase
    .from('news_ticker_map')
    .select('news_id')
    .in('symbol', symbols)
  if (mapErr) throw mapErr
  const ids = Array.from(new Set((mapRows ?? []).map((r) => r.news_id as number)))
  if (ids.length === 0) return []

  // 2) news 본문 + 최신순 limit
  const { data, error } = await supabase
    .from('news')
    .select('id, source, title, url, published_at')
    .in('id', ids)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toItem)
}

function toItem(row: { id: number; source: string; title: string; url: string; published_at: string | null }): NewsItem {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
  }
}
