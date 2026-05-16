// 보유 자산 목록 테이블. 행마다 인라인 수정/삭제 가능.
import { useState } from 'react'
import { deleteHolding, updateHolding } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import { normalizeError } from '../lib/errors'

type Props = {
  holdings: Holding[]
  onChanged: (next: Holding[]) => void
}

export function HoldingsList({ holdings, onChanged }: Props) {
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
            <th style={styles.th}>수량</th>
            <th style={styles.th}>매수단가 (USD)</th>
            <th style={styles.thRight}>액션</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const editing = editingId === h.id
            const busy = busyId === h.id
            return (
              <tr key={h.id} style={styles.tr}>
                <td style={styles.tdSymbol}>{h.symbol}</td>
                <td style={styles.td}>
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
                <td style={styles.td}>
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
  td: { padding: '10px 14px', fontSize: '14px', color: '#e6e8eb' },
  tdSymbol: { padding: '10px 14px', fontSize: '14px', fontWeight: 700, color: '#e6e8eb' },
  tdActions: {
    padding: '10px 14px',
    textAlign: 'right',
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  cellInput: {
    width: '120px',
    padding: '4px 8px',
    background: '#0b0d10',
    border: '1px solid #2a2f36',
    borderRadius: '4px',
    color: '#e6e8eb',
    fontSize: '13px',
    outline: 'none',
  },
  actionPrimary: {
    padding: '4px 10px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  actionGhost: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid #2a2f36',
    borderRadius: '4px',
    color: '#e6e8eb',
    fontSize: '12px',
    cursor: 'pointer',
  },
  actionDanger: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid #6b1f1f',
    borderRadius: '4px',
    color: '#fca5a5',
    fontSize: '12px',
    cursor: 'pointer',
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
