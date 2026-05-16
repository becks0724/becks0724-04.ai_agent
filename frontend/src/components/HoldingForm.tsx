// 신규 보유 자산 등록 폼. 매수단가는 KRW/USD 양방향 자동 환산.
import { useEffect, useState } from 'react'
import { createHolding } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import { fetchUsdKrw } from '../lib/fx'
import type { UsdKrwRate } from '../lib/fx'
import { normalizeError } from '../lib/errors'

type Props = {
  userId: string
  onCreated: (h: Holding) => void
}

export function HoldingForm({ userId, onCreated }: Props) {
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [krw, setKrw] = useState('') // 사용자 입력 KRW (문자열 보존)
  const [usd, setUsd] = useState('') // 사용자 입력 USD (문자열 보존)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fx, setFx] = useState<UsdKrwRate | null>(null)
  const [fxLoading, setFxLoading] = useState(true)
  const [fxError, setFxError] = useState<string | null>(null)

  const loadFx = async () => {
    setFxLoading(true)
    setFxError(null)
    try {
      const r = await fetchUsdKrw()
      setFx(r)
    } catch (e) {
      setFxError(e instanceof Error ? e.message : String(e))
    } finally {
      setFxLoading(false)
    }
  }

  useEffect(() => {
    loadFx()
  }, [])

  const onChangeKrw = (next: string) => {
    setKrw(next)
    if (!fx) {
      setUsd('')
      return
    }
    const n = Number(next)
    if (!Number.isFinite(n) || next === '') {
      setUsd('')
      return
    }
    // 1 USD = fx.rate KRW → USD = KRW / rate
    setUsd((n / fx.rate).toFixed(4))
  }

  const onChangeUsd = (next: string) => {
    setUsd(next)
    if (!fx) {
      setKrw('')
      return
    }
    const n = Number(next)
    if (!Number.isFinite(n) || next === '') {
      setKrw('')
      return
    }
    setKrw(Math.round(n * fx.rate).toString())
  }

  const reset = () => {
    setSymbol('')
    setQuantity('')
    setKrw('')
    setUsd('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const sym = symbol.trim().toUpperCase()
    const qty = Number(quantity)
    const priceUsd = Number(usd)

    if (!sym) return setError('심볼을 입력해라.')
    if (!Number.isFinite(qty) || qty <= 0) return setError('수량은 0보다 큰 숫자.')
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      return setError('매수단가(USD)는 0 이상이어야 한다. KRW만 입력했다면 환율 로딩을 기다려라.')
    }

    setSubmitting(true)
    try {
      const created = await createHolding(
        { symbol: sym, quantity: qty, avg_buy_price: priceUsd },
        userId,
      )
      onCreated(created)
      reset()
    } catch (e) {
      const { message, code } = normalizeError(e)
      // Postgres unique_violation = 23505. message 텍스트도 함께 검사.
      if (code === '23505' || message.includes('portfolio_holdings_user_symbol_unique')) {
        setError(`${sym}은 이미 등록되어 있다. 목록에서 수정해라.`)
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={styles.form}>
      <div style={styles.row}>
        <label style={styles.label}>
          심볼
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="BTC"
            style={styles.input}
            disabled={submitting}
            maxLength={16}
            required
          />
        </label>
        <label style={styles.label}>
          수량
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.5"
            step="any"
            min="0"
            style={styles.input}
            disabled={submitting}
            required
          />
        </label>
        <label style={styles.label}>
          매수단가 (KRW)
          <input
            type="number"
            value={krw}
            onChange={(e) => onChangeKrw(e.target.value)}
            placeholder="83,000,000"
            step="any"
            min="0"
            style={styles.input}
            disabled={submitting}
          />
        </label>
        <label style={styles.label}>
          매수단가 (USD)
          <input
            type="number"
            value={usd}
            onChange={(e) => onChangeUsd(e.target.value)}
            placeholder="60000"
            step="any"
            min="0"
            style={styles.input}
            disabled={submitting}
            required
          />
        </label>
        <button type="submit" style={styles.button} disabled={submitting}>
          {submitting ? '등록 중…' : '추가'}
        </button>
      </div>

      <div style={styles.fxLine}>
        {fxLoading && <span style={styles.muted}>환율 로딩…</span>}
        {fxError && <span style={styles.fxError}>환율 오류: {fxError}</span>}
        {fx && (
          <>
            <span style={styles.muted}>
              1 USD = {fx.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} KRW
              {' '}· 기준일 {fx.asOf} (ECB)
            </span>
            <button type="button" onClick={loadFx} style={styles.fxRefresh}>
              새로고침
            </button>
          </>
        )}
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: '#15181c',
    border: '1px solid #1c1f24',
    borderRadius: '10px',
    padding: '14px',
    marginBottom: '20px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '110px 110px 1fr 1fr auto',
    gap: '12px',
    alignItems: 'end',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: '#9aa3ad',
  },
  input: {
    padding: '8px 10px',
    background: '#0b0d10',
    border: '1px solid #2a2f36',
    borderRadius: '6px',
    color: '#e6e8eb',
    fontSize: '14px',
    outline: 'none',
  },
  button: {
    padding: '8px 14px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    height: '34px',
  },
  fxLine: {
    marginTop: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '12px',
  },
  muted: { color: '#9aa3ad' },
  fxRefresh: {
    padding: '2px 8px',
    background: 'transparent',
    border: '1px solid #2a2f36',
    borderRadius: '4px',
    color: '#9aa3ad',
    fontSize: '11px',
    cursor: 'pointer',
  },
  fxError: { color: '#fca5a5' },
  error: {
    marginTop: '10px',
    padding: '8px 10px',
    background: '#2a1212',
    border: '1px solid #6b1f1f',
    borderRadius: '6px',
    color: '#fca5a5',
    fontSize: '13px',
  },
}
