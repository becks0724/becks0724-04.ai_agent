// 보유 종목 또는 전체 최신 뉴스를 표시하는 피드. 5분 간격 polling.
// 카드 캐러셀 — 섹션 chip으로 카테고리 점프 + ←/→로 섹션 내 한 건씩 순환.
// 영문 제목은 MyMemory API로 한글 번역 (localStorage 캐시 적중 시 즉시).
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLatestNews, fetchNewsForSymbols } from '../lib/news'
import type { EventCategory, NewsItem, Sentiment } from '../lib/news'
import { normalizeError } from '../lib/errors'
import { getCachedTranslation, translateToKo } from '../lib/translate'

const SENTIMENT_META: Record<Sentiment, { label: string; bg: string; color: string; dot: string }> = {
  positive: { label: '긍정', bg: '#dcfce7', color: '#05b169', dot: '#05b169' },
  neutral:  { label: '중립', bg: '#eef0f3', color: '#5b616e', dot: '#7c828a' },
  negative: { label: '부정', bg: '#fee2e2', color: '#cf202f', dot: '#cf202f' },
}

const CATEGORY_LABEL: Record<EventCategory, string> = {
  listing:     '상장',
  regulation:  '규제',
  hack:        '해킹',
  partnership: '파트너십',
  tech:        '기술',
  general:     '일반',
}

// 섹션 표시 순서. 미정의 키는 마지막에 '미분류'로 묶임.
const SENTIMENT_ORDER: Sentiment[] = ['positive', 'neutral', 'negative']
const CATEGORY_ORDER: EventCategory[] = ['listing', 'regulation', 'hack', 'partnership', 'tech', 'general']

const NEWS_POLL_MS = 5 * 60_000
const NEWS_LIMIT = 60

type Props = {
  symbols: string[]
}

type FilterMode = 'holdings' | 'all'
type GroupMode = 'sentiment' | 'category' | 'symbol' | 'time'

type Tone = 'pos' | 'neu' | 'neg' | 'mute' | 'default'
type Section = { key: string; label: string; tone: Tone; items: NewsItem[] }

export function NewsFeed({ symbols }: Props) {
  const [filter, setFilter] = useState<FilterMode>(symbols.length > 0 ? 'holdings' : 'all')
  const [group, setGroup] = useState<GroupMode>('sentiment')
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)

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
          filter === 'holdings' && symbolsKey
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
  }, [filter, symbolsKey])

  const holdingSymbols = useMemo(
    () => (symbolsKey ? symbolsKey.split(',') : []),
    [symbolsKey],
  )
  const sections = useMemo(
    () => buildSections(items, group, holdingSymbols),
    [items, group, holdingSymbols],
  )

  // sections이 새로 만들어지면 activeKey가 여전히 유효한지 확인. 없으면 첫 섹션으로.
  useEffect(() => {
    if (sections.length === 0) {
      setActiveKey(null)
      setCursor(0)
      return
    }
    if (!sections.some((s) => s.key === activeKey)) {
      setActiveKey(sections[0].key)
      setCursor(0)
    }
  }, [sections, activeKey])

  const activeSection = sections.find((s) => s.key === activeKey) ?? sections[0]
  const total = activeSection?.items.length ?? 0
  const safeCursor = total > 0 ? Math.min(cursor, total - 1) : 0
  const current = activeSection?.items[safeCursor]

  const onSelectSection = (key: string) => {
    setActiveKey(key)
    setCursor(0)
  }
  const prev = () => total > 0 && setCursor((c) => (c - 1 + total) % total)
  const next = () => total > 0 && setCursor((c) => (c + 1) % total)

  // 현재 카드 + 인접 5건 prefetch 번역. 캐시 적중 시 즉시 반영.
  const [translations, setTranslations] = useState<Map<string, string>>(() => new Map())
  // 인접 prefetch 대상 (현재 + 다음 4건 wrap)
  const prefetchTargets = useMemo(() => {
    if (!activeSection || total === 0) return [] as string[]
    const out: string[] = []
    const window = Math.min(5, total)
    for (let i = 0; i < window; i++) {
      const idx = (safeCursor + i) % total
      out.push(activeSection.items[idx].title)
    }
    return out
  }, [activeSection, total, safeCursor])

  // 캐시 hydration — 마운트 시 또는 sections 변경 시 캐시에 이미 있는 번역을 한 번에 반영.
  const hydratedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!activeSection) return
    let mutated = false
    const next = new Map(translations)
    for (const it of activeSection.items) {
      if (hydratedRef.current.has(it.title)) continue
      hydratedRef.current.add(it.title)
      const cached = getCachedTranslation(it.title)
      if (cached) {
        next.set(it.title, cached)
        mutated = true
      }
    }
    if (mutated) setTranslations(next)
  }, [activeSection, translations])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (const title of prefetchTargets) {
        if (cancelled) return
        if (translations.has(title)) continue
        const ko = await translateToKo(title)
        if (cancelled) return
        if (ko) {
          setTranslations((prev) => {
            if (prev.has(title)) return prev
            const next = new Map(prev)
            next.set(title, ko)
            return next
          })
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [prefetchTargets, translations])

  return (
    <section style={styles.section}>
      <div style={styles.headerWrap}>
        <h2 style={styles.title}>뉴스</h2>
        <div style={styles.controls}>
          <ToggleGroup
            label="필터"
            value={filter}
            options={[
              { key: 'holdings', label: '보유 종목', disabled: !symbolsKey },
              { key: 'all', label: '전체' },
            ]}
            onChange={(v) => setFilter(v as FilterMode)}
          />
          <ToggleGroup
            label="그룹"
            value={group}
            options={[
              { key: 'sentiment', label: '감성' },
              { key: 'category', label: '카테고리' },
              { key: 'symbol', label: '종목', disabled: !symbolsKey && filter === 'holdings' },
              { key: 'time', label: '시간순' },
            ]}
            onChange={(v) => setGroup(v as GroupMode)}
          />
        </div>
      </div>

      {loading && items.length === 0 && <p style={styles.muted}>불러오는 중…</p>}
      {error && <p style={styles.error}>뉴스 조회 오류: {error}</p>}
      {!loading && !error && items.length === 0 && (
        <p style={styles.muted}>
          {filter === 'holdings'
            ? '보유 종목 관련 뉴스가 아직 없습니다. 워커 적재 후 새로고침하세요.'
            : '뉴스가 아직 없습니다.'}
        </p>
      )}

      {/* 섹션 chips — 시간순(단일 섹션)이면 숨김 */}
      {group !== 'time' && sections.length > 0 && (
        <div style={styles.chips}>
          {sections.map((s) => {
            const active = s.key === activeSection?.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onSelectSection(s.key)}
                style={active ? styles.chipActive : styles.chip}
              >
                <span style={{ ...styles.chipDot, background: toneColor(s.tone) }} />
                <span style={styles.chipLabel}>{s.label}</span>
                <span style={active ? styles.chipCountActive : styles.chipCount}>{s.items.length}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 카드 캐러셀 */}
      {current && activeSection && (
        <div style={styles.cardWrap}>
          <div style={styles.cardHeader}>
            <span style={styles.counter}>
              <span style={styles.counterIdx}>{safeCursor + 1}</span>
              <span style={styles.counterSep}>/</span>
              <span style={styles.counterTotal}>{total}</span>
              <span style={styles.counterSection}>· {activeSection.label}</span>
            </span>
            <div style={styles.navButtons}>
              <button type="button" onClick={prev} style={styles.navBtn} disabled={total <= 1} aria-label="이전">
                ←
              </button>
              <button type="button" onClick={next} style={styles.navBtn} disabled={total <= 1} aria-label="다음">
                →
              </button>
            </div>
          </div>

          <NewsCard item={current} titleKo={translations.get(current.title) ?? null} />
        </div>
      )}
    </section>
  )
}

function NewsCard({ item, titleKo }: { item: NewsItem; titleKo: string | null }) {
  return (
    <article style={styles.card}>
      <div style={styles.cardMetaTop}>
        <span style={styles.source}>{item.source}</span>
        {item.publishedAt && <span style={styles.dot}>·</span>}
        {item.publishedAt && <span style={styles.published}>{fmtDate(item.publishedAt)}</span>}
        {!titleKo && <span style={styles.translating}>번역 중…</span>}
      </div>

      <h3 style={styles.cardTitle}>{titleKo ?? item.title}</h3>
      {titleKo && <p style={styles.titleOriginal}>{item.title}</p>}

      <div style={styles.tagRow}>
        {item.sentiment && (
          <span
            style={{
              ...styles.badge,
              background: SENTIMENT_META[item.sentiment].bg,
              color: SENTIMENT_META[item.sentiment].color,
            }}
            title={item.confidence !== null ? `confidence ${item.confidence.toFixed(2)}` : ''}
          >
            {SENTIMENT_META[item.sentiment].label}
          </span>
        )}
        {item.eventCategory && (
          <span style={styles.tag}>{CATEGORY_LABEL[item.eventCategory]}</span>
        )}
        {item.symbols.length > 0 && (
          <span style={styles.symbols}>{item.symbols.join(', ')}</span>
        )}
      </div>

      <a href={item.url} target="_blank" rel="noopener noreferrer" style={styles.cta}>
        원문 보기 →
      </a>
    </article>
  )
}

function ToggleGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { key: string; label: string; disabled?: boolean }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={styles.toggle}>
      <span style={styles.toggleLabel}>{label}</span>
      <div style={styles.toggleButtons}>
        {options.map((o) => {
          const active = o.key === value
          return (
            <button
              key={o.key}
              type="button"
              style={active ? styles.tabActive : styles.tab}
              disabled={o.disabled}
              onClick={() => onChange(o.key)}
              title={o.disabled ? '데이터가 없어 비활성화됨' : ''}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function buildSections(
  items: NewsItem[],
  group: GroupMode,
  holdingSymbols: string[],
): Section[] {
  if (items.length === 0) return []

  if (group === 'time') {
    return [{ key: 'all', label: '최신순', tone: 'default', items }]
  }

  if (group === 'sentiment') {
    const out: Section[] = []
    for (const s of SENTIMENT_ORDER) {
      const filtered = items.filter((n) => n.sentiment === s)
      if (filtered.length > 0) {
        out.push({
          key: `sent-${s}`,
          label: SENTIMENT_META[s].label,
          tone: s === 'positive' ? 'pos' : s === 'negative' ? 'neg' : 'neu',
          items: filtered,
        })
      }
    }
    const unclassified = items.filter((n) => n.sentiment === null)
    if (unclassified.length > 0) {
      out.push({ key: 'sent-none', label: '미분류', tone: 'mute', items: unclassified })
    }
    return out
  }

  if (group === 'category') {
    const out: Section[] = []
    for (const c of CATEGORY_ORDER) {
      const filtered = items.filter((n) => n.eventCategory === c)
      if (filtered.length > 0) {
        out.push({ key: `cat-${c}`, label: CATEGORY_LABEL[c], tone: 'default', items: filtered })
      }
    }
    const unclassified = items.filter((n) => n.eventCategory === null)
    if (unclassified.length > 0) {
      out.push({ key: 'cat-none', label: '미분류', tone: 'mute', items: unclassified })
    }
    return out
  }

  // group === 'symbol'. 보유 심볼 우선 정렬, 그 외 매핑된 심볼은 알파벳순. 매핑 없는 뉴스는 '기타'.
  const buckets = new Map<string, NewsItem[]>()
  const orphan: NewsItem[] = []
  for (const n of items) {
    if (n.symbols.length === 0) {
      orphan.push(n)
      continue
    }
    for (const sym of n.symbols) {
      const arr = buckets.get(sym) ?? []
      arr.push(n)
      buckets.set(sym, arr)
    }
  }
  const holdingSet = new Set(holdingSymbols)
  const ordered = [
    ...holdingSymbols.filter((s) => buckets.has(s)),
    ...Array.from(buckets.keys()).filter((s) => !holdingSet.has(s)).sort(),
  ]
  const out: Section[] = ordered.map((sym) => ({
    key: `sym-${sym}`,
    label: sym,
    tone: 'default',
    items: buckets.get(sym)!,
  }))
  if (orphan.length > 0) {
    out.push({ key: 'sym-none', label: '기타 (매핑 없음)', tone: 'mute', items: orphan })
  }
  return out
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'pos':  return '#05b169'
    case 'neg':  return '#cf202f'
    case 'neu':  return '#7c828a'
    case 'mute': return '#a8acb3'
    default:     return '#0052ff'
  }
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

const monoFont = "'JetBrains Mono', ui-monospace, monospace"

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginTop: '24px',
    padding: '32px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
  },
  headerWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 600,
    color: '#0a0b0d',
    letterSpacing: '-0.3px',
  },
  controls: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  toggleLabel: {
    fontSize: '12px',
    color: '#5b616e',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  toggleButtons: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: '#f7f7f7',
    borderRadius: '100px',
  },
  tab: {
    padding: '6px 14px',
    background: 'transparent',
    color: '#5b616e',
    border: 'none',
    borderRadius: '100px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  tabActive: {
    padding: '6px 14px',
    background: '#0a0b0d',
    color: '#ffffff',
    border: 'none',
    borderRadius: '100px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
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

  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '20px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px 8px 12px',
    background: '#ffffff',
    color: '#0a0b0d',
    border: '1px solid #dee1e6',
    borderRadius: '100px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s ease',
  },
  chipActive: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px 8px 12px',
    background: '#0a0b0d',
    color: '#ffffff',
    border: '1px solid #0a0b0d',
    borderRadius: '100px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  chipDot: {
    width: '8px',
    height: '8px',
    borderRadius: '9999px',
    flexShrink: 0,
  },
  chipLabel: {},
  chipCount: {
    background: '#eef0f3',
    color: '#5b616e',
    padding: '1px 8px',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: monoFont,
  },
  chipCountActive: {
    background: '#ffffff',
    color: '#0a0b0d',
    padding: '1px 8px',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: monoFont,
  },

  cardWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '4px',
    fontFamily: monoFont,
    fontSize: '13px',
    color: '#5b616e',
  },
  counterIdx: { color: '#0a0b0d', fontWeight: 700, fontSize: '15px' },
  counterSep: { color: '#a8acb3' },
  counterTotal: { color: '#5b616e' },
  counterSection: {
    marginLeft: '10px',
    color: '#7c828a',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
  },
  navButtons: { display: 'flex', gap: '8px' },
  navBtn: {
    width: '40px',
    height: '40px',
    padding: 0,
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '9999px',
    color: '#0a0b0d',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    padding: '32px',
    background: '#f7f7f7',
    borderRadius: '16px',
    border: '1px solid #eef0f3',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minHeight: '220px',
  },
  cardMetaTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#5b616e',
  },
  source: {
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 700,
    color: '#0052ff',
  },
  dot: { color: '#a8acb3' },
  published: { color: '#7c828a', fontFamily: monoFont },
  cardTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.3px',
    color: '#0a0b0d',
  },
  titleOriginal: {
    margin: 0,
    fontSize: '13px',
    color: '#7c828a',
    lineHeight: 1.5,
    fontStyle: 'italic',
  },
  translating: {
    marginLeft: '6px',
    padding: '2px 8px',
    background: '#e5edff',
    color: '#0052ff',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 600,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 600,
  },
  tag: {
    padding: '4px 12px',
    borderRadius: '100px',
    fontSize: '12px',
    color: '#0a0b0d',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    fontWeight: 600,
  },
  symbols: {
    padding: '4px 12px',
    borderRadius: '100px',
    fontSize: '12px',
    color: '#0052ff',
    background: '#e5edff',
    fontWeight: 700,
    fontFamily: monoFont,
  },
  cta: {
    marginTop: 'auto',
    alignSelf: 'flex-start',
    color: '#0052ff',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
  },
}
