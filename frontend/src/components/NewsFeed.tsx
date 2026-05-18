// 보유 종목 또는 전체 최신 뉴스를 표시하는 피드. 5분 간격 polling.
import { useEffect, useMemo, useState } from 'react'
import { fetchLatestNews, fetchNewsForSymbols } from '../lib/news'
import type { NewsItem } from '../lib/news'
import { normalizeError } from '../lib/errors'

const NEWS_POLL_MS = 5 * 60_000
const NEWS_LIMIT = 20

type Props = {
  symbols: string[]
}

type Mode = 'holdings' | 'all'

export function NewsFeed({ symbols }: Props) {
  const [mode, setMode] = useState<Mode>(symbols.length > 0 ? 'holdings' : 'all')
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 보유 심볼 → 정렬·중복제거된 안정 키 (배열 참조 변경에 영향 안 받음)
  const symbolsKey = useMemo(
    () => Array.from(new Set(symbols)).sort().join(','),
    [symbols],
  )

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const next =
          mode === 'holdings' && symbolsKey
            ? await fetchNewsForSymbols(symbolsKey.split(','), NEWS_LIMIT)
            : await fetchLatestNews(NEWS_LIMIT)
        if (mounted) setItems(next)
      } catch (e) {
        if (mounted) setError(normalizeError(e).message)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, NEWS_POLL_MS)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [mode, symbolsKey])

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h2 style={styles.title}>뉴스</h2>
        <div style={styles.tabs}>
          <button
            type="button"
            style={mode === 'holdings' ? styles.tabActive : styles.tab}
            onClick={() => setMode('holdings')}
            disabled={!symbolsKey}
            title={symbolsKey ? '' : '보유 자산을 추가하면 활성화됩니다'}
          >
            보유 종목
          </button>
          <button
            type="button"
            style={mode === 'all' ? styles.tabActive : styles.tab}
            onClick={() => setMode('all')}
          >
            전체
          </button>
        </div>
      </div>

      {loading && items.length === 0 && <p style={styles.muted}>불러오는 중…</p>}
      {error && <p style={styles.error}>뉴스 조회 오류: {error}</p>}
      {!loading && !error && items.length === 0 && (
        <p style={styles.muted}>
          {mode === 'holdings'
            ? '보유 종목 관련 뉴스가 아직 없습니다. 워커 적재 후 새로고침하세요.'
            : '뉴스가 아직 없습니다.'}
        </p>
      )}

      <ul style={styles.list}>
        {items.map((n) => (
          <li key={n.id} style={styles.item}>
            <a href={n.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
              {n.title}
            </a>
            <div style={styles.meta}>
              <span style={styles.source}>{n.source}</span>
              {n.publishedAt && <span style={styles.published}>{fmtDate(n.publishedAt)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginTop: '24px',
    padding: '14px',
    background: '#15181c',
    border: '1px solid #1c1f24',
    borderRadius: '10px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: { margin: 0, fontSize: '16px', fontWeight: 600 },
  tabs: { display: 'flex', gap: '6px' },
  tab: {
    padding: '4px 10px',
    background: 'transparent',
    color: '#9aa3ad',
    border: '1px solid #2a2f36',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  tabActive: {
    padding: '4px 10px',
    background: '#1c2128',
    color: '#e6e8eb',
    border: '1px solid #3b4350',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
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
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' },
  item: {
    paddingBottom: '8px',
    borderBottom: '1px solid #1c1f24',
  },
  link: {
    color: '#e6e8eb',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.4,
  },
  meta: {
    marginTop: '4px',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    fontSize: '11px',
    color: '#9aa3ad',
  },
  source: { textTransform: 'uppercase', letterSpacing: '0.5px' },
  published: {},
}
