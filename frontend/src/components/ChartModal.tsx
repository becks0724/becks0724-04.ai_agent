// 종목별 일봉 + RSI/MACD 보조 패널 차트 모달.
// lightweight-charts v5 multi-pane (paneIndex API)로 가격/RSI/MACD 세로 3단 동기화 차트.
import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  ColorType,
  LineSeries,
  HistogramSeries,
  type IChartApi,
} from 'lightweight-charts'
import { fetchCandles, type Candle } from '../lib/candles'
import { fetchIndicators, type IndicatorPoint } from '../lib/indicatorsApi'
import { normalizeError } from '../lib/errors'

type Props = { symbol: string; onClose: () => void }

const PRICE_COLOR = '#0052ff'
const RSI_COLOR = '#7c3aed'
const MACD_COLOR = '#0052ff'
const SIGNAL_COLOR = '#f4b000'
const UP_COLOR = '#05b169'
const DOWN_COLOR = '#cf202f'
const TEXT_COLOR = '#5b616e'
const GRID_COLOR = '#eef0f3'
const BORDER_COLOR = '#dee1e6'

export function ChartModal({ symbol, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const [candles, setCandles] = useState<Candle[]>([])
  const [indicators, setIndicators] = useState<IndicatorPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 데이터 로드
  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([fetchCandles(symbol), fetchIndicators(symbol)])
      .then(([c, i]) => {
        if (!mounted) return
        setCandles(c)
        setIndicators(i)
        setError(null)
      })
      .catch((e) => {
        if (!mounted) return
        setError(normalizeError(e).message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [symbol])

  // 차트 인스턴스 생성·갱신. paneIndex 0/1/2로 가격/RSI/MACD 세로 분할.
  useEffect(() => {
    if (!containerRef.current) return
    if (candles.length === 0) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: TEXT_COLOR,
        fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace",
        panes: {
          separatorColor: BORDER_COLOR,
          separatorHoverColor: BORDER_COLOR,
          enableResize: false,
        },
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      timeScale: { borderColor: BORDER_COLOR, timeVisible: false },
      rightPriceScale: { borderColor: BORDER_COLOR },
      crosshair: { mode: 1 },
    })
    chartRef.current = chart

    // ─── Pane 0: 가격 라인 ──────────────────────────────
    const priceSeries = chart.addSeries(LineSeries, {
      color: PRICE_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    // UTCTimestamp(초) + ts 기준 dedup (과거 dispatch와 백필이 같은 일자에 다른 시각으로 적재됐을 수 있음).
    const priceMap = new Map<number, number>()
    for (const c of candles) {
      const ts = Math.floor(new Date(c.openTime).getTime() / 1000)
      if (!Number.isFinite(ts)) continue
      priceMap.set(ts, c.close)
    }
    const priceData = Array.from(priceMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as never, value }))
    priceSeries.setData(priceData)

    // ─── Pane 1: RSI 14 + 30/70 기준선 ────────────────
    const rsiData = pickIndicator(indicators, 'rsi14')
    if (rsiData.length > 0) {
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: RSI_COLOR,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        1,
      )
      rsiSeries.setData(rsiData)
      // RSI는 0-100 고정 + reference lines @30/70
      rsiSeries.applyOptions({ priceFormat: { type: 'price', precision: 2, minMove: 0.01 } })
      rsiSeries.createPriceLine({
        price: 70,
        color: '#a8acb3',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '70',
      })
      rsiSeries.createPriceLine({
        price: 30,
        color: '#a8acb3',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '30',
      })
    }

    // ─── Pane 2: MACD (line + signal + histogram) ──────
    const macdData = pickIndicator(indicators, 'macd')
    const signalData = pickIndicator(indicators, 'macdSignal')
    const histData = pickIndicatorHist(indicators)
    if (macdData.length > 0) {
      const macdSeries = chart.addSeries(
        LineSeries,
        {
          color: MACD_COLOR,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        2,
      )
      macdSeries.setData(macdData)
      macdSeries.createPriceLine({
        price: 0,
        color: '#a8acb3',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '0',
      })
    }
    if (signalData.length > 0) {
      const signalSeries = chart.addSeries(
        LineSeries,
        {
          color: SIGNAL_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        2,
      )
      signalSeries.setData(signalData)
    }
    if (histData.length > 0) {
      const histSeries = chart.addSeries(
        HistogramSeries,
        {
          color: UP_COLOR,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        2,
      )
      // hist 양/음에 따라 컬러 분기
      histSeries.setData(
        histData.map((d) => ({
          time: d.time,
          value: d.value,
          color: d.value >= 0 ? UP_COLOR : DOWN_COLOR,
        })),
      )
    }

    chart.timeScale().fitContent()

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
    }
  }, [candles, indicators])

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const latestInd = indicators.length > 0 ? indicators[indicators.length - 1] : null
  // 값 크기에 따라 표시 정밀도 가변 — 큰 값(MACD 226)은 소수점 줄이고, 작은 값(FET MACD 0.0048)은 늘려 0으로 보이지 않게.
  const fmt = (v: number | null): string => {
    if (v === null || v === undefined) return '—'
    const abs = Math.abs(v)
    if (abs === 0) return '0'
    if (abs >= 100) return v.toFixed(2)
    if (abs >= 1) return v.toFixed(3)
    if (abs >= 0.01) return v.toFixed(4)
    return v.toFixed(6)
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={styles.header}>
          <div style={styles.titleWrap}>
            <div style={styles.assetIcon}>{symbol.charAt(0)}</div>
            <div>
              <div style={styles.title}>{symbol}</div>
              <div style={styles.subtitle}>일봉 · 가격 / RSI 14 / MACD 12,26,9</div>
            </div>
          </div>
          <button type="button" style={styles.close} onClick={onClose}>
            닫기
          </button>
        </header>

        {loading && <p style={styles.muted}>불러오는 중…</p>}
        {error && <p style={styles.error}>차트 로딩 오류: {error}</p>}

        {!loading && !error && candles.length === 0 && (
          <p style={styles.muted}>적재된 캔들이 없다. 워커 candle-poll이 1회 이상 실행돼야 한다.</p>
        )}

        {/* 차트 컨테이너 — multi-pane가 자동으로 세로 분할 */}
        <div ref={containerRef} style={styles.chart} />

        <div style={styles.statRow}>
          <Stat label="캔들" value={`${candles.length}건`} />
          <Stat label="RSI 14" value={fmt(latestInd?.rsi14 ?? null)} tone={rsiTone(latestInd?.rsi14)} />
          <Stat label="MACD" value={fmt(latestInd?.macd ?? null)} />
          <Stat label="Signal" value={fmt(latestInd?.macdSignal ?? null)} />
          <Stat
            label="Hist"
            value={fmt(latestInd?.macdHist ?? null)}
            tone={histTone(latestInd?.macdHist)}
          />
        </div>

        <div style={styles.legend}>
          <LegendDot color={PRICE_COLOR} label="가격" />
          <LegendDot color={RSI_COLOR} label="RSI 14" />
          <LegendDot color={MACD_COLOR} label="MACD" />
          <LegendDot color={SIGNAL_COLOR} label="Signal" />
          <LegendDot color={UP_COLOR} label="Hist +" />
          <LegendDot color={DOWN_COLOR} label="Hist −" />
        </div>

        <p style={styles.disclaimer}>
          ※ 통계 표시 전용. 매매 신호가 아니다. RSI 14·MACD(12,26,9)는 데이터가 14~35일 이상 누적되어야 의미를 가진다.
        </p>
      </div>
    </div>
  )
}

function pickIndicator(
  rows: IndicatorPoint[],
  key: 'rsi14' | 'macd' | 'macdSignal',
): { time: never; value: number }[] {
  const map = new Map<number, number>()
  for (const r of rows) {
    const ts = Math.floor(new Date(r.openTime).getTime() / 1000)
    if (!Number.isFinite(ts)) continue
    const v = r[key]
    if (v === null || v === undefined) continue
    map.set(ts, v)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time: time as never, value }))
}

function pickIndicatorHist(rows: IndicatorPoint[]): { time: never; value: number }[] {
  const map = new Map<number, number>()
  for (const r of rows) {
    const ts = Math.floor(new Date(r.openTime).getTime() / 1000)
    if (!Number.isFinite(ts)) continue
    if (r.macdHist === null || r.macdHist === undefined) continue
    map.set(ts, r.macdHist)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time: time as never, value }))
}

function rsiTone(v: number | null | undefined): 'pos' | 'neg' | 'mute' | undefined {
  if (v === null || v === undefined) return undefined
  if (v >= 70) return 'neg'   // 과매수 — 위험 신호로 적색 처리
  if (v <= 30) return 'pos'   // 과매도 — 반등 가능성으로 녹색 처리
  return undefined
}

function histTone(v: number | null | undefined): 'pos' | 'neg' | undefined {
  if (v === null || v === undefined) return undefined
  return v >= 0 ? 'pos' : 'neg'
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' | 'mute' }) {
  const color =
    tone === 'pos' ? UP_COLOR :
    tone === 'neg' ? DOWN_COLOR :
    tone === 'mute' ? '#5b616e' : '#0a0b0d'
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={styles.legendItem}>
      <span style={{ ...styles.legendDot, background: color }} />
      <span>{label}</span>
    </span>
  )
}

const numberFont = "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace"

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,11,13,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '960px',
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
    padding: '32px',
    color: '#0a0b0d',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  titleWrap: { display: 'flex', alignItems: 'center', gap: '14px' },
  assetIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '9999px',
    background: '#eef0f3',
    color: '#0a0b0d',
    fontSize: '16px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: '22px', fontWeight: 600, color: '#0a0b0d', letterSpacing: '-0.3px' },
  subtitle: { fontSize: '13px', color: '#5b616e', marginTop: '2px' },
  close: {
    padding: '8px 18px',
    background: '#eef0f3',
    border: 'none',
    borderRadius: '100px',
    color: '#0a0b0d',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    height: '36px',
  },
  chart: { width: '100%', height: '520px' },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '14px',
    marginTop: '16px',
    padding: '12px 16px',
    background: '#f7f7f7',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#5b616e',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: 500,
  },
  legendDot: {
    width: '10px',
    height: '3px',
    borderRadius: '2px',
    display: 'inline-block',
  },
  statRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '12px',
    marginTop: '20px',
  },
  stat: {
    padding: '14px 16px',
    background: '#f7f7f7',
    borderRadius: '12px',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: 600,
    marginTop: '4px',
    fontFamily: numberFont,
  },
  disclaimer: {
    marginTop: '16px',
    fontSize: '12px',
    color: '#7c828a',
    lineHeight: 1.5,
  },
  muted: { color: '#5b616e', fontSize: '14px' },
  error: {
    padding: '12px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    color: '#cf202f',
    fontSize: '14px',
  },
}
