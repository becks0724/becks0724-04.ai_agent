// 보유 자산 목록 테이블. 현재가/평가금액/손익 컬럼 + 인라인 수정/삭제 + 차트 모달.
import { useState } from 'react'
import { deleteHolding, updateHolding } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import type { PriceSnapshot } from '../lib/prices'
import type { UsdKrwRate } from '../lib/fx'
import { normalizeError } from '../lib/errors'
import { ChartModal } from './ChartModal'

type Props = {
  holdings: Holding[]
  prices: Map<string, PriceSnapshot>
  fx: UsdKrwRate | null
  onChanged: (next: Holding[]) => void
}

export function HoldingsList({ holdings, prices, fx, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftQty, setDraftQty] = useState('')
  const [draftPrice, setDraftPrice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chartSymbol, setChartSymbol] = useState<string | null>(null)

  if (holdings.length === 0) {
    return (
      <div style={styles.emptyCard}>
        <p style={styles.empty}>등록된 보유 자산이 없다. 위 폼에서 추가해라.</p>
      </div>
    )
  }

  const startEdit = (h: Holding) => {
    setEditingId(h.id)
    setDraftQty(String(h.quantity))
    setDraftPrice(String(h.avg_buy_price))
    setError(null)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setError(null)
  }
  const saveEdit = async (h: Holding) => {
    const qty = Number(draftQty)
    const price = Number(draftPrice)
    if (!Number.isFinite(qty) || qty <= 0) return setError('수량은 0보다 큰 숫자.')
    if (!Number.isFinite(price) || price < 0) return setError('매수단가는 0 이상.')
    setBusyId(h.id)
    setError(null)
    try {
      const updated = await updateHolding(h.id, { quantity: qty, avg_buy_price: price })
      onChanged(holdings.map((x) => (x.id === h.id ? updated : x)))
      setEditingId(null)
    } catch (e) {
      setError(normalizeError(e).message)
    } finally {
      setBusyId(null)
    }
  }
  const remove = async (h: Holding) => {
    if (!confirm(`${h.symbol} 보유 자산을 삭제할까?`)) return
    setBusyId(h.id)
    setError(null)
    try {
      await deleteHolding(h.id)
      onChanged(holdings.filter((x) => x.id !== h.id))
    } catch (e) {
      setError(normalizeError(e).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={styles.card}>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.cardHeader}>보유 자산</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>심볼</th>
            <th style={styles.thRight}>수량</th>
            <th style={styles.thRight}>매수단가 (USD)</th>
            <th style={styles.thRight}>현재가 (USD)</th>
            <th style={styles.thRight}>평가금액</th>
            <th style={styles.thRight}>손익</th>
            <th style={styles.thActions}>액션</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const editing = editingId === h.id
            const busy = busyId === h.id
            const snap = prices.get(h.symbol)
            const cost = h.quantity * h.avg_buy_price
            const value = snap ? h.quantity * snap.price_usd : null
            const pnl = value !== null ? value - cost : null
            const pnlPct = pnl !== null && cost > 0 ? (pnl / cost) * 100 : null
            const pnlColor =
              pnl === null ? '#5b616e' : pnl > 0 ? '#05b169' : pnl < 0 ? '#cf202f' : '#5b616e'
            const priceChangeColor = getPriceChangeColor(snap?.price_change_24h_pct ?? null)
            return (
              <tr key={h.id} style={styles.tr}>
                <td style={styles.tdSymbol}>
                  <div style={styles.symbolWrap}>
                    <div style={styles.assetIcon}>{h.symbol.charAt(0)}</div>
                    <div>
                      <div style={styles.symbolTicker}>{h.symbol}</div>
                    </div>
                  </div>
                </td>
                <td style={styles.tdRight}>
                  {editing ? (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draftQty}
                      onChange={(e) => setDraftQty(e.target.value)}
                      style={styles.cellInput}
                      disabled={busy}
                    />
                  ) : (
                    formatNumber(h.quantity)
                  )}
                </td>
                <td style={styles.tdRight}>
                  {editing ? (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draftPrice}
                      onChange={(e) => setDraftPrice(e.target.value)}
                      style={styles.cellInput}
                      disabled={busy}
                    />
                  ) : (
                    formatUsd(h.avg_buy_price)
                  )}
                </td>
                <td style={styles.tdRight}>
                  {snap ? (
                    <>
                      <div style={styles.priceMain}>{formatUsd(snap.price_usd)}</div>
                      <div style={{ ...styles.priceChange, color: priceChangeColor }}>
                        {formatPct(snap.price_change_24h_pct)}
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={styles.tdRight}>
                  {value !== null ? (
                    <>
                      <div style={styles.priceMain}>{formatUsd(value)}</div>
                      <div style={styles.subKrw}>{formatKrw(value, fx)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ ...styles.tdRight, color: pnlColor }}>
                  {pnl !== null ? (
                    <>
                      <div style={styles.priceMain}>
                        {formatUsd(pnl)}
                        {pnlPct !== null && (
                          <span style={styles.pct}> ({pnlPct.toFixed(2)}%)</span>
                        )}
                      </div>
                      <div style={{ ...styles.subKrw, color: pnlColor, opacity: 0.7 }}>
                        {formatKrw(pnl, fx)}
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={styles.tdActions}>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveEdit(h)}
                        disabled={busy}
                        style={styles.actionPrimary}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busy}
                        style={styles.actionGhost}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setChartSymbol(h.symbol)}
                        disabled={busy}
                        style={styles.actionGhost}
                      >
                        차트
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(h)}
                        disabled={busy}
                        style={styles.actionGhost}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(h)}
                        disabled={busy}
                        style={styles.actionDanger}
                      >
                        삭제
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {chartSymbol && (
        <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />
      )}
    </div>
  )
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n)
}
function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n)
}
function formatKrw(usd: number, fx: UsdKrwRate | null): string {
  if (!fx) return ''
  return `₩${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(usd * fx.rate)}`
}
function formatPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}
function getPriceChangeColor(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n === 0) return '#5b616e'
  return n > 0 ? '#cf202f' : '#0052ff'
}

const numberFont = "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace"

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
    padding: '24px 32px 32px',
    marginBottom: '24px',
    overflow: 'hidden',
  },
  cardHeader: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0a0b0d',
    marginBottom: '16px',
  },
  emptyCard: {
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
    padding: '40px 32px',
    marginBottom: '24px',
    textAlign: 'center',
  },
  empty: { color: '#5b616e', fontSize: '15px' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px 12px 0',
    fontSize: '12px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  thRight: {
    textAlign: 'right',
    padding: '12px 16px',
    fontSize: '12px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  thActions: {
    textAlign: 'right',
    padding: '12px 0 12px 16px',
    fontSize: '12px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  tr: { borderBottom: '1px solid #eef0f3' },
  tdSymbol: {
    padding: '16px 16px 16px 0',
    fontSize: '15px',
    fontWeight: 600,
    color: '#0a0b0d',
    verticalAlign: 'top',
  },
  symbolWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  assetIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '9999px',
    background: '#eef0f3',
    color: '#0a0b0d',
    fontSize: '13px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolTicker: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#0a0b0d',
  },
  tdRight: {
    padding: '16px',
    fontSize: '15px',
    color: '#0a0b0d',
    textAlign: 'right',
    verticalAlign: 'top',
    fontFamily: numberFont,
    fontWeight: 500,
  },
  priceMain: { fontSize: '15px', fontWeight: 500 },
  priceChange: {
    fontSize: '12px',
    marginTop: '4px',
    fontFamily: numberFont,
    fontWeight: 600,
  },
  subKrw: {
    fontSize: '12px',
    color: '#5b616e',
    marginTop: '4px',
    fontFamily: numberFont,
  },
  pct: { fontSize: '13px', marginLeft: '4px' },
  tdActions: {
    padding: '16px 0 16px 16px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  cellInput: {
    width: '120px',
    padding: '8px 10px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '8px',
    color: '#0a0b0d',
    fontSize: '14px',
    textAlign: 'right',
    fontFamily: numberFont,
  },
  actionPrimary: {
    padding: '6px 14px',
    background: '#0052ff',
    border: 'none',
    borderRadius: '100px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: '6px',
    height: '32px',
  },
  actionGhost: {
    padding: '6px 14px',
    background: '#eef0f3',
    border: 'none',
    borderRadius: '100px',
    color: '#0a0b0d',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: '6px',
    height: '32px',
  },
  actionDanger: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #cf202f',
    borderRadius: '100px',
    color: '#cf202f',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: '6px',
    height: '32px',
  },
  error: {
    marginBottom: '14px',
    padding: '12px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    color: '#cf202f',
    fontSize: '14px',
  },
}
