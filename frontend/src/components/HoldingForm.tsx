// 신규 보유 자산 등록 폼. 매수단가는 KRW/USD 양방향 자동 환산.
// fx 상태는 AppShell이 보유하고 prop으로 내려준다. userId는 useAuth()로 직접 조회.
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { createHolding } from '../lib/holdings'
import type { Holding } from '../lib/holdings'
import type { UsdKrwRate } from '../lib/fx'
import { normalizeError } from '../lib/errors'
import { fetchTopCoins, searchCoins } from '../lib/coins'
import type { CoinOption } from '../lib/coins'

const SUGGEST_DEBOUNCE_MS = 200

type Props = {
  fx: UsdKrwRate | null
  fxLoading: boolean
  fxError: string | null
  onReloadFx: () => void
  onCreated: (h: Holding) => void
}

export function HoldingForm({ fx, fxLoading, fxError, onReloadFx, onCreated }: Props) {
  const { user } = useAuth()
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [krw, setKrw] = useState('')
  const [usd, setUsd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // coins_catalog 자동완성. query 디바운스 200ms로 호출 부담 감소.
  const [suggestions, setSuggestions] = useState<CoinOption[]>([])
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    // 초기 마운트 시 상위 30개 로드. 입력이 비어있을 때 표시.
    fetchTopCoins().then(setSuggestions).catch(() => setSuggestions([]))
  }, [])

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    const q = symbol.trim()
    debounceRef.current = window.setTimeout(() => {
      searchCoins(q).then(setSuggestions).catch(() => {
        // 자동완성 실패는 silent (직접 입력으로 진행 가능)
      })
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [symbol])

  const onChangeKrw = (next: string) => {
    setKrw(next)
    if (!fx || next === '') {
      setUsd('')
      return
    }
    const n = Number(next)
    if (!Number.isFinite(n)) {
      setUsd('')
      return
    }
    setUsd((n / fx.rate).toFixed(4))
  }

  const onChangeUsd = (next: string) => {
    setUsd(next)
    if (!fx || next === '') {
      setKrw('')
      return
    }
    const n = Number(next)
    if (!Number.isFinite(n)) {
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
    if (!user) return setError('로그인 세션이 만료됐다. 새로고침 후 다시 시도해라.')

    setSubmitting(true)
    try {
      const created = await createHolding(
        { symbol: sym, quantity: qty, avg_buy_price: priceUsd },
        user.id,
      )
      onCreated(created)
      reset()
    } catch (e) {
      const { message, code } = normalizeError(e)
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
      <div style={styles.title}>새 보유 자산 등록</div>
      <div style={styles.row}>
        <label style={styles.label}>
          심볼
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="BTC / Bitcoin"
            style={styles.input}
            disabled={submitting}
            maxLength={32}
            list="coins-suggest"
            autoComplete="off"
            required
          />
          <datalist id="coins-suggest">
            {suggestions.map((c) => (
              <option
                key={c.coingeckoId}
                value={c.symbol}
                label={`${c.name}${c.marketCapRank ? ` (#${c.marketCapRank})` : ''}`}
              />
            ))}
          </datalist>
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
        <button
          type="submit"
          style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }}
          disabled={submitting}
        >
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
              {' '}· 기준일 {fx.asOf.slice(0, 10)} ({fx.source})
            </span>
            <button type="button" onClick={onReloadFx} style={styles.fxRefresh}>
              새로고침
            </button>
          </>
        )}
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </form>
  )
}

const numberFont = "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace"

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
    padding: '32px',
    marginBottom: '24px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0a0b0d',
    marginBottom: '20px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr 1.2fr 1.2fr auto',
    gap: '16px',
    alignItems: 'end',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '13px',
    color: '#5b616e',
    fontWeight: 500,
  },
  input: {
    padding: '12px 14px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '12px',
    color: '#0a0b0d',
    fontSize: '15px',
    height: '44px',
    fontFamily: numberFont,
  },
  button: {
    padding: '12px 24px',
    background: '#0052ff',
    border: 'none',
    borderRadius: '100px',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '15px',
    cursor: 'pointer',
    height: '44px',
    whiteSpace: 'nowrap',
  },
  buttonDisabled: {
    background: '#a8b8cc',
    cursor: 'not-allowed',
  },
  fxLine: {
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
  },
  muted: { color: '#5b616e' },
  fxRefresh: {
    padding: '4px 12px',
    background: '#eef0f3',
    border: 'none',
    borderRadius: '100px',
    color: '#0a0b0d',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  fxError: { color: '#cf202f' },
  error: {
    marginTop: '14px',
    padding: '12px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    color: '#cf202f',
    fontSize: '14px',
  },
}
