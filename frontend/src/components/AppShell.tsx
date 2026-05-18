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
import { normalizeError } from '../lib/errors'
import { HoldingForm } from './HoldingForm'
import { HoldingsList } from './HoldingsList'
import { NewsFeed } from './NewsFeed'

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
        <div style={styles.brand}>crypto-monitoring</div>
        {fearGreed && (
          <div style={styles.fearGreed} title={`기준일 ${fearGreed.capturedAt.slice(0, 10)}`}>
            <span style={styles.fgLabel}>공포·탐욕</span>
            <span style={{ ...styles.fgValue, color: fgColor(fearGreed.classification) }}>
              {fearGreed.value}
            </span>
            <span style={styles.fgClass}>({fearGreed.classification})</span>
          </div>
        )}
        <div style={styles.right}>
          <span style={styles.email}>{email}</span>
          <button
            type="button"
            style={styles.logout}
            onClick={() => signOut()}
          >
            로그아웃
          </button>
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
    totals.totalPnlUsd > 0 ? '#34d399' : totals.totalPnlUsd < 0 ? '#fca5a5' : '#9aa3ad'
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
            시세 미보유: {totals.missingSymbols.join(', ')} — 워커 POLL_SYMBOLS에 추가 필요
          </div>
        )}
        {pricesError && <div style={summaryStyles.warn}>가격 조회 오류: {pricesError}</div>}
      </div>
    </div>
  )
}

function fgColor(classification: string): string {
  switch (classification) {
    case 'Extreme Fear': return '#fca5a5'
    case 'Fear':         return '#fb923c'
    case 'Neutral':      return '#facc15'
    case 'Greed':        return '#86efac'
    case 'Extreme Greed':return '#34d399'
    default:             return '#9aa3ad'
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', background: '#0b0d10', color: '#e6e8eb' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid #1c1f24',
  },
  brand: { fontWeight: 700 },
  fearGreed: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    padding: '4px 10px',
    background: '#11141a',
    border: '1px solid #1c1f24',
    borderRadius: '6px',
  },
  fgLabel: { fontSize: '12px', color: '#9aa3ad' },
  fgValue: { fontSize: '16px', fontWeight: 700 },
  fgClass: { fontSize: '12px', color: '#9aa3ad' },
  right: { display: 'flex', alignItems: 'center', gap: '12px' },
  email: { color: '#9aa3ad', fontSize: '13px' },
  logout: {
    padding: '6px 10px',
    background: 'transparent',
    border: '1px solid #2a2f36',
    borderRadius: '6px',
    color: '#e6e8eb',
    cursor: 'pointer',
    fontSize: '13px',
  },
  main: { padding: '24px 20px', maxWidth: '1100px', margin: '0 auto' },
  sectionTitle: { margin: '4px 0 14px', fontSize: '16px', fontWeight: 600 },
  muted: { color: '#9aa3ad', fontSize: '14px' },
  error: {
    padding: '8px 10px',
    background: '#2a1212',
    border: '1px solid #6b1f1f',
    borderRadius: '6px',
    color: '#fca5a5',
    fontSize: '13px',
  },
}

const summaryStyles: Record<string, React.CSSProperties> = {
  box: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: '12px',
    padding: '14px',
    background: '#15181c',
    border: '1px solid #1c1f24',
    borderRadius: '10px',
    marginBottom: '16px',
  },
  col: { display: 'flex', flexDirection: 'column', gap: '4px' },
  colMeta: { display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' },
  label: { fontSize: '12px', color: '#9aa3ad' },
  value: { fontSize: '18px', fontWeight: 700 },
  pct: { fontSize: '14px', fontWeight: 600, marginLeft: '4px' },
  sub: { fontSize: '12px', color: '#9aa3ad' },
  metaLine: { fontSize: '12px', color: '#9aa3ad' },
  warn: {
    fontSize: '12px',
    color: '#facc15',
    padding: '4px 8px',
    background: '#2a2110',
    border: '1px solid #6b5a1f',
    borderRadius: '4px',
  },
}
