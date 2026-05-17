// Supabase candles 테이블에서 (symbol, timeframe) 시계열을 조회하는 헬퍼.
import { supabase } from './supabase'

export type Candle = {
  openTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export async function fetchCandles(
  symbol: string,
  timeframe = '1d',
  limit = 200,
): Promise<Candle[]> {
  const { data, error } = await supabase
    .from('candles')
    .select('open_time, open, high, low, close, volume')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .order('open_time', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    openTime: r.open_time as string,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: r.volume === null ? null : Number(r.volume),
  }))
}
