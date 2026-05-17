// Supabase indicators 테이블에서 (symbol, timeframe) RSI·MACD 시계열을 조회하는 헬퍼.
// 파일명 indicatorsApi.ts — worker/indicators.py와 혼동 방지.
import { supabase } from './supabase'

export type IndicatorPoint = {
  openTime: string
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  macdHist: number | null
}

export async function fetchIndicators(
  symbol: string,
  timeframe = '1d',
  limit = 200,
): Promise<IndicatorPoint[]> {
  const { data, error } = await supabase
    .from('indicators')
    .select('open_time, rsi_14, macd, macd_signal, macd_hist')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .order('open_time', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    openTime: r.open_time as string,
    rsi14: r.rsi_14 === null ? null : Number(r.rsi_14),
    macd: r.macd === null ? null : Number(r.macd),
    macdSignal: r.macd_signal === null ? null : Number(r.macd_signal),
    macdHist: r.macd_hist === null ? null : Number(r.macd_hist),
  }))
}
