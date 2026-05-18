// 종목별 일봉 line chart + 최신 RSI/MACD 표시 모달.
// lightweight-charts v5 API 기준 (chart.addSeries(LineSeries, ...)).
import { useEffect, useRef, useState } from 'react'
import { createChart, LineSeries, ColorType, type IChartApi } from 'lightweight-charts'
import { fetchCandles, type Candle } from '../lib/candles'
import { fetchIndicators, type IndicatorPoint } from '../lib/indicatorsApi'
import { normalizeError } from '../lib/errors'

type Props = { symbol: string; onClose: () => void }

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

  // 차트 인스턴스 생성·갱신
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0d10' },
        textColor: '#9aa3ad',
      },
      grid: {
        vertLines: { color: '#1c1f24' },
        horzLines: { color: '#1c1f24' },
      },
      timeScale: { borderColor: '#1c1f24' },
      rightPriceScale: { borderColor: '#1c1f24' },
    })
    chartRef.current = chart
    const series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
    })
    // UTCTimestamp(초) 사용 + ts 기준 dedup(과거 dispatch와 백필이 같은 일자에 다른 시각으로 적재됐을 수 있음).
    const dataMap = new Map<number, number>()
    for (const c of candles) {
      const ts = Math.floor(new Date(c.openTime).getTime() / 1000)
      if (!Number.isFinite(ts)) continue
      dataMap.set(ts, c.close)
    }
    const data = Array.from(dataMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as never, value }))
    series.setData(data)
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
  }, [candles])

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
    if (v === null) return '—'
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
          <div style={styles.title}>{symbol} 일봉 · 200일 line</div>
          <button type="button" style={styles.close} onClick={onClose}>
            닫기
          </button>
        </header>

        {loading && <p style={styles.muted}>불러오는 중…</p>}
        {error && <p style={styles.error}>차트 로딩 오류: {error}</p>}

        {!loading && !error && candles.length === 0 && (
          <p style={styles.muted}>적재된 캔들이 없다. 워커 candle-poll이 1회 이상 실행돼야 한다.</p>
        )}

        <div ref={containerRef} style={styles.chart} />

        <div style={styles.statRow}>
          <Stat label="캔들" value={`${candles.length}건`} />
          <Stat label="RSI 14" value={fmt(latestInd?.rsi14 ?? null)} />
          <Stat label="MACD" value={fmt(latestInd?.macd ?? null)} />
          <Stat label="Signal" value={fmt(latestInd?.macdSignal ?? null)} />
          <Stat label="Hist" value={fmt(latestInd?.macdHist ?? null)} />
        </div>

        <p style={styles.disclaimer}>
          ※ 통계 표시 전용. 매매 신호가 아니다. RSI 14·MACD(12,26,9)는 데이터가 14~35일 이상 누적되어야 의미를 가진다.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '760px',
    background: '#15181c',
    border: '1px solid #1c1f24',
    borderRadius: '10px',
    padding: '18px',
    color: '#e6e8eb',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: { fontSize: '15px', fontWeight: 700 },
  close: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid #2a2f36',
    borderRadius: '6px',
    color: '#e6e8eb',
    cursor: 'pointer',
    fontSize: '12px',
  },
  chart: { width: '100%', height: '300px' },
  statRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '8px',
    marginTop: '12px',
  },
  stat: {
    padding: '8px 10px',
    background: '#11141a',
    border: '1px solid #1c1f24',
    borderRadius: '6px',
    textAlign: 'center',
  },
  statLabel: { fontSize: '11px', color: '#9aa3ad' },
  statValue: { fontSize: '14px', fontWeight: 700, marginTop: '2px' },
  disclaimer: {
    marginTop: '10px',
    fontSize: '11px',
    color: '#9aa3ad',
    lineHeight: 1.5,
  },
  muted: { color: '#9aa3ad', fontSize: '13px' },
  error: {
    padding: '8px 10px',
    background: '#2a1212',
    border: '1px solid #6b1f1f',
    borderRadius: '6px',
    color: '#fca5a5',
    fontSize: '13px',
  },
}
