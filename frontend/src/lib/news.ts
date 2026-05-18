// Supabase news / news_ticker_map / news_classifications 테이블에서 보유 종목 또는 전체 최신 뉴스를 조회하는 헬퍼.
import { supabase } from './supabase'

export type Sentiment = 'positive' | 'neutral' | 'negative'
export type EventCategory = 'listing' | 'regulation' | 'hack' | 'partnership' | 'tech' | 'general'

export type NewsItem = {
  id: number
  source: string
  title: string
  url: string
  publishedAt: string | null
  sentiment: Sentiment | null
  eventCategory: EventCategory | null
  confidence: number | null
}

const NEWS_SELECT =
  'id, source, title, url, published_at, news_classifications(sentiment, event_category, confidence)'

export async function fetchLatestNews(limit = 20): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('news')
    .select(NEWS_SELECT)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toItem)
}

export async function fetchNewsForSymbols(symbols: string[], limit = 20): Promise<NewsItem[]> {
  if (symbols.length === 0) return []

  const { data: mapRows, error: mapErr } = await supabase
    .from('news_ticker_map')
    .select('news_id')
    .in('symbol', symbols)
  if (mapErr) throw mapErr
  const ids = Array.from(new Set((mapRows ?? []).map((r) => r.news_id as number)))
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('news')
    .select(NEWS_SELECT)
    .in('id', ids)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(toItem)
}

type ClassificationRow = {
  sentiment: Sentiment
  event_category: EventCategory
  confidence: number | null
}

type NewsRow = {
  id: number
  source: string
  title: string
  url: string
  published_at: string | null
  // PostgREST 1:1 임베딩은 객체 또는 null. 일부 환경에선 배열로도 돌아올 수 있어 양쪽 다 방어.
  news_classifications: ClassificationRow | ClassificationRow[] | null
}

function toItem(row: NewsRow): NewsItem {
  const c = Array.isArray(row.news_classifications)
    ? row.news_classifications[0] ?? null
    : row.news_classifications
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
    sentiment: c?.sentiment ?? null,
    eventCategory: c?.event_category ?? null,
    confidence: c?.confidence ?? null,
  }
}
