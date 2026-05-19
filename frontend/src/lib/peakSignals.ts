// Supabase peak_signals 테이블에서 signal_key별 최신 1행을 조회하는 헬퍼.
// PostgREST는 group by per key 미지원이라 클라이언트에서 grouping.
import { supabase } from './supabase'

export type SignalStatus = 'ok' | 'insufficient_data' | 'error'

export type PeakSignal = {
  signalKey: string
  value: number | null
  threshold: number | null
  hit: boolean | null
  progressPct: number | null
  source: string
  status: SignalStatus
  note: string | null
  capturedAt: string
}

// signal_key → 한국어 라벨 + 설명 + 표시 단위. 워커가 적재하는 키에 맞춰 갱신.
export const SIGNAL_META: Record<
  string,
  { label: string; desc: string; unit?: '%' | '' | 'band' | 'BTC' | 'days' }
> = {
  btc_dominance: {
    label: 'BTC 도미넌스',
    desc: '전체 시총 대비 BTC 점유율(%). 70% 이상은 BTC 우위 사이클 후반 영역.',
    unit: '%',
  },
  mayer_multiple: {
    label: 'Mayer Multiple',
    desc: '현재가 / 200dMA. 역사적으로 2.4 이상은 사이클 후반 영역.',
  },
  pi_cycle_top: {
    label: 'Pi Cycle Top',
    desc: '111dMA / (350dMA × 2). 1.0 도달은 매 사이클 정점 신호.',
  },
  btc_rsi_22: {
    label: 'BTC RSI 22',
    desc: 'BTC 일봉 22일 RSI. 70 이상은 과매수 영역 — 단기 정점 가능성.',
  },
  ahr999: {
    label: 'AHR999',
    desc: '(현재가 / 200d 기하평균) × (현재가 / 회귀가격). 1.2 이상은 매도 영역.',
  },
  rainbow_band: {
    label: 'Rainbow Band',
    desc: 'BTC log 회귀 밴드 인덱스(0-7). 6 이상은 Bubble 영역.',
    unit: 'band',
  },
  two_year_ma_multiple: {
    label: '2년 MA Multiple',
    desc: '현재가 / 2년(730일) SMA. 5배 이상은 역사적 사이클 정점.',
  },
  puell_multiple: {
    label: 'Puell Multiple',
    desc: '일일 채굴 발행량 × 가격 / 365d 평균. 4 이상은 채굴자 수익 정점.',
  },
  mvrv_z_score: {
    label: 'MVRV Z-Score',
    desc: '(시총 − Realized Cap) / 표준편차. 7 이상은 역사적 top zone.',
  },
  nupl: {
    label: 'NUPL',
    desc: 'Net Unrealized Profit/Loss. 0.75 이상은 euphoria(과열) 영역.',
  },
  mvrv_ratio: {
    label: 'MVRV Ratio',
    desc: '시총 / Realized Cap. 3.7 이상은 정점 영역.',
  },
  etf_outflow_streak: {
    label: 'ETF 순유출 연속일',
    desc: '미국 spot BTC ETF 총 flow가 연속 순유출인 거래일 수. 5일 이상이면 수요 약화 신호.',
    unit: 'days',
  },
  etf_net_flow_btc_mcap_pct: {
    label: 'ETF/BTC Flow 비율',
    desc: 'Farside 누적 spot BTC ETF 순유입 / CoinGecko BTC 시총(%). 보유 BTC 비율이 아닌 flow proxy.',
    unit: '%',
  },
  mstr_btc_holdings: {
    label: 'Strategy BTC 보유',
    desc: 'Strategy Inc(구 MicroStrategy)의 BTC 보유 수량. 정보성 지표 (명중 임계 없음).',
    unit: 'BTC',
  },
  mstr_pnl_ratio: {
    label: 'Strategy PnL 비율',
    desc: 'Strategy 보유 BTC 현재 평가 / 평균 매입 비용. 2.0 이상은 역사적 사이클 top 영역.',
  },
  altcoin_season_index: {
    label: 'Altcoin Season Index',
    desc: 'CoinMarketCap 알트코인 시즌 지수(0-100). 75 이상은 알트시즌 진입 — BTC 사이클 후반 신호.',
  },
}

// 표시 순서. 정의되지 않은 키는 알파벳순으로 뒤에 붙음.
const DISPLAY_ORDER = [
  'btc_dominance',
  'mayer_multiple',
  'pi_cycle_top',
  'btc_rsi_22',
  'ahr999',
  'rainbow_band',
  'two_year_ma_multiple',
  // 2.5-D 무료 온체인 (bitcoin-data.com)
  'puell_multiple',
  'mvrv_z_score',
  'nupl',
  'mvrv_ratio',
  // 2.5-C 합법 무료 (CoinGecko 상장사 treasury)
  'etf_outflow_streak',
  'etf_net_flow_btc_mcap_pct',
  'mstr_btc_holdings',
  'mstr_pnl_ratio',
  // 2.5-B0 CMC 공식 API (사용자 key 발급 시 활성화)
  'altcoin_season_index',
]

export async function fetchLatestPeakSignals(): Promise<PeakSignal[]> {
  // 최근 90일치만 끌어와 클라이언트에서 signal_key별 최신 1행 추출.
  const { data, error } = await supabase
    .from('peak_signals')
    .select('signal_key, value, threshold, hit, progress_pct, source, status, note, captured_at')
    .order('captured_at', { ascending: false })
    .limit(500)
  if (error) throw error

  const byKey = new Map<string, PeakSignal>()
  for (const r of data ?? []) {
    const key = r.signal_key as string
    if (byKey.has(key)) continue
    byKey.set(key, {
      signalKey: key,
      value: r.value === null ? null : Number(r.value),
      threshold: r.threshold === null ? null : Number(r.threshold),
      hit: r.hit === null ? null : Boolean(r.hit),
      progressPct: r.progress_pct === null ? null : Number(r.progress_pct),
      source: String(r.source),
      status: (r.status as SignalStatus) ?? 'ok',
      note: r.note ? String(r.note) : null,
      capturedAt: String(r.captured_at),
    })
  }

  // DISPLAY_ORDER 우선, 그 외는 알파벳순.
  const known = DISPLAY_ORDER.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!)
  const rest = Array.from(byKey.keys())
    .filter((k) => !DISPLAY_ORDER.includes(k))
    .sort()
    .map((k) => byKey.get(k)!)
  return [...known, ...rest]
}
