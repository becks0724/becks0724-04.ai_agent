// Supabase fear_greed 테이블에서 최신 1건을 조회하는 헬퍼.
import { supabase } from './supabase'

export type FearGreed = {
  value: number
  classification: string
  capturedAt: string
}

export async function fetchLatestFearGreed(): Promise<FearGreed | null> {
  const { data, error } = await supabase
    .from('fear_greed')
    .select('value, classification, captured_at')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    value: data.value,
    classification: data.classification,
    capturedAt: data.captured_at,
  }
}
