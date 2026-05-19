// 로그인 후 표시되는 헤더 + 포트폴리오 폼 + 보유 목록.
// fx(환율)와 prices(시세) 폴링을 이 컴포넌트에서 관리하고 자식에게 prop으로 전달한다.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { listHoldings } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import { fetchUsdKrw } from '../lib/fx'
import type { UsdKrwRate } from '../lib/fx'
import { fetchLatestPrices } from '../lib/prices'
import type { PriceSnapshot } from '../lib/prices'
import { fetchLatestFearGreed } from '../lib/fearGreed'
import type { FearGreed } from '../lib/fearGreed'
import { fetchLatestPeakSignals } from '../lib/peakSignals'
import type { PeakSignal } from '../lib/peakSignals'
import { normalizeError } from '../lib/errors'
import { HoldingForm } from './HoldingForm'
import { HoldingsList } from './HoldingsList'
import { NewsFeed } from './NewsFeed'
import { PeakSignals } from './PeakSignals'

const PRICE_POLL_MS = 30_000

export function AppShell() {
  const { user, signOut } = useAuth()
  const email = user?.email ?? '익명'

  // holdings
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [holdingsLoading, setHoldingsLoading] = useState(true)
  const [holdingsError, setHoldingsError] = useState<string | null>(null)

  // fx (환율)
  const [fx, setFx] = useState<UsdKrwRate | null>(null)
  const [fxLoading, setFxLoading] = useState(true)
  const [fxError, setFxError] = useState<string | null>(null)

  // prices
  const [prices, setPrices] = useState<Map<string, PriceSnapshot>>(new Map())
  const [pricesAt, setPricesAt] = useState<number | null>(null)
  const [pricesError, setPricesError] = useState<string | null>(null)

  // fear & greed (일 1회 갱신이라 마운트 시 1회만 조회. 사용자는 새로고침으로 최신화 가능)
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null)
  const [altcoinSeason, setAltcoinSeason] = useState<PeakSignal | null>(null)

  // 환율 1회 로드 + 수동 새로고침
  const loadFx = useCallback(async () => {
    setFxLoading(true)
    setFxError(null)
    try {
      setFx(await fetchUsdKrw())
    } catch (e) {
      setFxError(normalizeError(e).message)
    } finally {
      setFxLoading(false)
    }
  }, [])

  // 헤더용 Altcoin Season Index. 실패해도 핵심 화면에는 영향 없게 silent.
  useEffect(() => {
    let mounted = true
    fetchLatestPeakSignals()
      .then((rows) => {
        if (!mounted) return
        setAltcoinSeason(rows.find((row) => row.signalKey === 'altcoin_season_index') ?? null)
      })
      .catch(() => {
        // CMC 키 미발급/지표 미적재 상태는 PeakSignals 표에서 상세히 보인다.
      })
    return () => {
      mounted = false
    }
  }, [])
  useEffect(() => {
    loadFx()
  }, [loadFx])

  // fear & greed 1회 로드. 실패해도 다른 영역 영향 없게 silent.
  useEffect(() => {
    let mounted = true
    fetchLatestFearGreed()
      .then((row) => {
        if (mounted) setFearGreed(row)
      })
      .catch(() => {
        // 표시 영역만 사라질 뿐 핵심 기능엔 영향 없으니 사용자 알림 생략.
      })
    return () => {
      mounted = false
    }
  }, [])

  // holdings 1회 로드
  useEffect(() => {
    let mounted = true
    setHoldingsLoading(true)
    listHoldings()
      .then((rows) => {
        if (!mounted) return
        setHoldings(rows)
        setHoldingsError(null)
      })
      .catch((e) => {
        if (!mounted) return
        setHoldingsError(normalizeError(e).message)
      })
      .finally(() => {
        if (mounted) setHoldingsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  // 보유 심볼 변화 또는 주기 호출 시 prices 폴링
  const symbolsKey = Array.from(new Set(holdings.map((h) => h.symbol))).sort().join(',')
  const loadPrices = useCallback(async () => {
    if (!symbolsKey) {
      setPrices(new Map())
      setPricesAt(Date.now())
      return
    }
    const symbols = symbolsKey.split(',')
    try {
      const next = await fetchLatestPrices(symbols)
      setPrices(next)
      setPricesAt(Date.now())
      setPricesError(null)
    } catch (e) {
      setPricesError(normalizeError(e).message)
    }
  }, [symbolsKey])

  useEffect(() => {
    loadPrices()
    const id = setInterval(loadPrices, PRICE_POLL_MS)
    return () => clearInterval(id)
  }, [loadPrices])

  // 요약 계산
  const totals = computeTotals(holdings, prices)

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>crypto-monitoring</div>
          <div style={styles.right}>
            {altcoinSeason && (
              <div
                style={styles.marketPill}
                title={`기준일 ${altcoinSeason.capturedAt.slice(0, 10)}${altcoinSeason.note ? ` · ${altcoinSeason.note}` : ''}`}
              >
                <span style={styles.fgLabel}>Altcoin Season</span>
                <span style={{ ...styles.fgValue, color: altcoinSeasonColor(altcoinSeason) }}>
                  {formatAltcoinSeason(altcoinSeason)}
                </span>
              </div>
            )}
            {fearGreed && (
              <div style={styles.marketPill} title={`기준일 ${fearGreed.capturedAt.slice(0, 10)}`}>
                <span style={styles.fgLabel}>Fear &amp; Greed</span>
                <span style={{ ...styles.fgValue, color: fgColor(fearGreed.classification) }}>
                  {fearGreed.value}
                </span>
                <span style={styles.fgClass}>· {fearGreed.classification}</span>
              </div>
            )}
            <span style={styles.email}>{email}</span>
            <button
              type="button"
              style={styles.logout}
              onClick={() => signOut()}
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main style={styles.main}>
        <h2 style={styles.sectionTitle}>포트폴리오</h2>

        <SummaryBox totals={totals} fx={fx} pricesAt={pricesAt} pricesError={pricesError} />

        <HoldingForm
          fx={fx}
          fxLoading={fxLoading}
          fxError={fxError}
          onReloadFx={loadFx}
          onCreated={(h) => setHoldings((prev) => [...prev, h])}
        />

        {holdingsLoading && <p style={styles.muted}>불러오는 중…</p>}
        {holdingsError && <p style={styles.error}>목록 로딩 오류: {holdingsError}</p>}
        {!holdingsLoading && !holdingsError && (
          <HoldingsList
            holdings={holdings}
            prices={prices}
            fx={fx}
            onChanged={setHoldings}
          />
        )}

        <PeakSignals />

        <NewsFeed symbols={holdings.map((h) => h.symbol)} />
      </main>
    </div>
  )
}

type Totals = {
  totalCostUsd: number
  totalValueUsd: number
  totalPnlUsd: number
  pnlPct: number | null
  missingSymbols: string[]
}

function computeTotals(holdings: Holding[], prices: Map<string, PriceSnapshot>): Totals {
  let totalCost = 0
  let totalValue = 0
  const missing: string[] = []
  for (const h of holdings) {
    totalCost += h.quantity * h.avg_buy_price
    const p = prices.get(h.symbol)
    if (p) totalValue += h.quantity * p.price_usd
    else missing.push(h.symbol)
  }
  const pnl = totalValue - totalCost
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : null
  return {
    totalCostUsd: totalCost,
    totalValueUsd: totalValue,
    totalPnlUsd: pnl,
    pnlPct,
    missingSymbols: missing,
  }
}

function SummaryBox({
  totals,
  fx,
  pricesAt,
  pricesError,
}: {
  totals: Totals
  fx: UsdKrwRate | null
  pricesAt: number | null
  pricesError: string | null
}) {
  // 1초 tick으로 "마지막 갱신 N초 전" 카운터를 매초 리렌더.
  const [, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const fmtUsd = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
  const fmtKrw = (n: number) =>
    fx ? `₩${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(n * fx.rate)}` : '—'
  const pnlColor =
    totals.totalPnlUsd > 0 ? '#05b169' : totals.totalPnlUsd < 0 ? '#cf202f' : '#5b616e'
  const ago = pricesAt ? Math.max(0, Math.floor((Date.now() - pricesAt) / 1000)) : null
  return (
    <div style={summaryStyles.box}>
      <div style={summaryStyles.col}>
        <div style={summaryStyles.label}>총 평가금액</div>
        <div style={summaryStyles.value}>{fmtUsd(totals.totalValueUsd)}</div>
        <div style={summaryStyles.sub}>{fmtKrw(totals.totalValueUsd)}</div>
      </div>
      <div style={summaryStyles.col}>
        <div style={summaryStyles.label}>총 매수금액</div>
        <div style={summaryStyles.value}>{fmtUsd(totals.totalCostUsd)}</div>
        <div style={summaryStyles.sub}>{fmtKrw(totals.totalCostUsd)}</div>
      </div>
      <div style={summaryStyles.col}>
        <div style={summaryStyles.label}>손익</div>
        <div style={{ ...summaryStyles.value, color: pnlColor }}>
          {fmtUsd(totals.totalPnlUsd)}
          {totals.pnlPct !== null && (
            <span style={summaryStyles.pct}> ({totals.pnlPct.toFixed(2)}%)</span>
          )}
        </div>
        <div style={summaryStyles.sub}>{fmtKrw(totals.totalPnlUsd)}</div>
      </div>
      <div style={summaryStyles.colMeta}>
        <div style={summaryStyles.metaLine}>
          {ago === null ? '시세 로딩…' : `마지막 갱신 ${ago}초 전`}
        </div>
        {totals.missingSymbols.length > 0 && (
          <div style={summaryStyles.warn}>
            시세 미보유: {totals.missingSymbols.join(', ')} — 다음 워커 사이클(15분 이내)에서 자동 적재. catalog 미등록 심볼이면 계속 비어 있을 수 있음.
          </div>
        )}
        {pricesError && <div style={summaryStyles.warn}>가격 조회 오류: {pricesError}</div>}
      </div>
    </div>
  )
}

function fgColor(classification: string): string {
  switch (classification) {
    case 'Extreme Fear': return '#cf202f'
    case 'Fear':         return '#cf202f'
    case 'Neutral':      return '#5b616e'
    case 'Greed':        return '#05b169'
    case 'Extreme Greed':return '#05b169'
    default:             return '#5b616e'
  }
}

function formatAltcoinSeason(signal: PeakSignal): string {
  if (signal.status === 'insufficient_data') return '대기'
  if (signal.status === 'error') return '오류'
  return signal.value === null ? '—' : signal.value.toFixed(0)
}

function altcoinSeasonColor(signal: PeakSignal): string {
  if (signal.status === 'insufficient_data') return '#0052ff'
  if (signal.status === 'error') return '#cf202f'
  if (signal.hit) return '#cf202f'
  return '#5b616e'
}

const numberFont = "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace"

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#ffffff', color: '#0a0b0d' },
  header: {
    background: '#ffffff',
    borderBottom: '1px solid #dee1e6',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: '1200px',
    margin: '0 auto',
    height: '64px',
    padding: '0 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontWeight: 600,
    fontSize: '18px',
    color: '#0052ff',
    letterSpacing: '-0.2px',
  },
  marketPill: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '6px',
    padding: '6px 14px',
    background: '#eef0f3',
    borderRadius: '100px',
    fontSize: '13px',
  },
  fgLabel: { fontSize: '12px', color: '#5b616e', fontWeight: 500 },
  fgValue: { fontSize: '14px', fontWeight: 600, fontFamily: numberFont },
  fgClass: { fontSize: '12px', color: '#5b616e' },
  right: { display: 'flex', alignItems: 'center', gap: '14px' },
  email: { color: '#5b616e', fontSize: '13px' },
  logout: {
    padding: '8px 16px',
    background: '#eef0f3',
    border: 'none',
    borderRadius: '100px',
    color: '#0a0b0d',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    height: '36px',
  },
  main: { padding: '40px 24px 96px', maxWidth: '1200px', margin: '0 auto' },
  sectionTitle: {
    margin: '0 0 24px',
    fontSize: '32px',
    fontWeight: 400,
    letterSpacing: '-0.4px',
    color: '#0a0b0d',
    lineHeight: 1.13,
  },
  muted: { color: '#5b616e', fontSize: '14px' },
  error: {
    padding: '14px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    color: '#cf202f',
    fontSize: '14px',
  },
}

const summaryStyles: Record<string, React.CSSProperties> = {
  box: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1.2fr',
    gap: '0',
    padding: '32px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
    marginBottom: '24px',
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingRight: '24px',
    borderRight: '1px solid #eef0f3',
  },
  colMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    justifyContent: 'center',
    paddingLeft: '24px',
  },
  label: {
    fontSize: '13px',
    color: '#5b616e',
    fontWeight: 500,
  },
  value: {
    fontSize: '24px',
    fontWeight: 500,
    fontFamily: numberFont,
    color: '#0a0b0d',
    letterSpacing: '-0.3px',
  },
  pct: { fontSize: '14px', fontWeight: 500, marginLeft: '6px', fontFamily: numberFont },
  sub: { fontSize: '13px', color: '#5b616e', fontFamily: numberFont },
  metaLine: { fontSize: '13px', color: '#5b616e' },
  warn: {
    fontSize: '12px',
    color: '#0a0b0d',
    padding: '8px 12px',
    background: '#fff8e6',
    border: '1px solid #f4b000',
    borderRadius: '8px',
  },
}
