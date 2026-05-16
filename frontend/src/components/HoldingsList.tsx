// 보유 자산 목록 테이블. 현재가/평가금액/손익 컬럼 + 인라인 수정/삭제.
import { useState } from 'react'
import { deleteHolding, updateHolding } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import type { PriceSnapshot } from '../lib/prices'
import type { UsdKrwRate } from '../lib/fx'
import { normalizeError } from '../lib/errors'

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

  if (holdings.length === 0) {
    return <p style={styles.empty}>등록된 보유 자산이 없다. 위 폼에서 추가해라.</p>
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
    <div>
      {error && <p style={styles.error}>{error}</p>}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>심볼</th>
            <th style={styles.thRight}>수량</th>
            <th style={styles.thRight}>매수단가 (USD)</th>
            <th style={styles.thRight}>현재가 (USD)</th>
            <th style={styles.thRight}>평가금액</th>
            <th style={styles.thRight}>손익</th>
            <th style={styles.thRight}>액션</th>
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
              pnl === null ? '#9aa3ad' : pnl > 0 ? '#34d399' : pnl < 0 ? '#fca5a5' : '#9aa3ad'
            return (
              <tr key={h.id} style={styles.tr}>
                <td style={styles.tdSymbol}>{h.symbol}</td>
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
                <td style={styles.tdRight}>{snap ? formatUsd(snap.price_usd) : '—'}</td>
                <td style={styles.tdRight}>
                  {value !== null ? (
                    <>
                      <div>{formatUsd(value)}</div>
                      <div style={styles.subKrw}>{formatKrw(value, fx)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ ...styles.tdRight, color: pnlColor }}>
                  {pnl !== null ? (
                    <>
                      <div>
                        {formatUsd(pnl)}
                        {pnlPct !== null && (
                          <span style={styles.pct}> ({pnlPct.toFixed(2)}%)</span>
                        )}
                      </div>
                      <div style={styles.subKrw}>{formatKrw(pnl, fx)}</div>
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

const styles: Record<string, React.CSSProperties> = {
  empty: { color: '#9aa3ad', fontSize: '14px' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#15181c',
    border: '1px solid #1c1f24',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: '12px',
    color: '#9aa3ad',
    fontWeight: 600,
    background: '#11141a',
    borderBottom: '1px solid #1c1f24',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 14px',
    fontSize: '12px',
    color: '#9aa3ad',
    fontWeight: 600,
    background: '#11141a',
    borderBottom: '1px solid #1c1f24',
  },
  tr: { borderBottom: '1px solid #1c1f24' },
  tdSymbol: { padding: '10px 14px', fontSize: '14px', fontWeight: 700, color: '#e6e8eb' },
  tdRight: {
    padding: '10px 14px',
    fontSize: '14px',
    color: '#e6e8eb',
    textAlign: 'right',
    verticalAlign: 'top',
  },
  subKrw: { fontSize: '11px', color: '#9aa3ad', marginTop: '2px' },
  pct: { fontSize: '12px', marginLeft: '4px' },
  tdActions: {
    padding: '10px 14px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  cellInput: {
    width: '110px',
    padding: '4px 8px',
    background: '#0b0d10',
    border: '1px solid #2a2f36',
    borderRadius: '4px',
    color: '#e6e8eb',
    fontSize: '13px',
    outline: 'none',
    textAlign: 'right',
  },
  actionPrimary: {
    padding: '4px 10px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
    marginLeft: '4px',
  },
  actionGhost: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid #2a2f36',
    borderRadius: '4px',
    color: '#e6e8eb',
    fontSize: '12px',
    cursor: 'pointer',
    marginLeft: '4px',
  },
  actionDanger: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid #6b1f1f',
    borderRadius: '4px',
    color: '#fca5a5',
    fontSize: '12px',
    cursor: 'pointer',
    marginLeft: '4px',
  },
  error: {
    marginBottom: '10px',
    padding: '8px 10px',
    background: '#2a1212',
    border: '1px solid #6b1f1f',
    borderRadius: '6px',
    color: '#fca5a5',
    fontSize: '13px',
  },
}
