// 강세장 정점 신호 표 (Stage 2.5). peak_signals 테이블의 signal_key별 최신 행을 표시.
// 매도 신호 아님 — 통계 표시 전용 면책 강제.
import { useEffect, useState } from 'react'
import { fetchLatestPeakSignals, SIGNAL_META, type PeakSignal } from '../lib/peakSignals'
import { normalizeError } from '../lib/errors'

const POLL_MS = 10 * 60_000  // 일 1회 적재라 자주 부를 필요 없음. 10분 주기로 충분.

export function PeakSignals() {
  const [signals, setSignals] = useState<PeakSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const next = await fetchLatestPeakSignals()
        if (mounted) {
          setSignals(next)
          setError(null)
        }
      } catch (e) {
        if (mounted) setError(normalizeError(e).message)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  const okSignals = signals.filter((s) => s.status === 'ok')
  const hitable = okSignals.filter((s) => s.threshold !== null)
  const hits = hitable.filter((s) => s.hit === true).length
  const avgProgress =
    hitable.length > 0
      ? hitable
          .map((s) => (s.progressPct === null ? 0 : s.progressPct))
          .reduce((a, b) => a + b, 0) / hitable.length
      : null

  return (
    <section style={styles.section}>
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>강세장 정점 신호</h2>
          <p style={styles.subtitle}>통계 표시 전용 · 매매 신호 아님</p>
        </div>
        <div style={styles.headerActions}>
          {hitable.length > 0 && (
            <div style={styles.summary}>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>명중</div>
                <div style={styles.summaryValue}>
                  <span style={{ color: hits > 0 ? '#cf202f' : '#0a0b0d' }}>{hits}</span>
                  <span style={styles.summarySep}>/</span>
                  <span style={styles.summaryTotal}>{hitable.length}</span>
                </div>
              </div>
              {avgProgress !== null && (
                <div style={styles.summaryItem}>
                  <div style={styles.summaryLabel}>평균 진행률</div>
                  <div style={styles.summaryValue}>{avgProgress.toFixed(1)}%</div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            style={styles.toggleButton}
            onClick={() => setCollapsed((next) => !next)}
            aria-expanded={!collapsed}
          >
            {collapsed ? '펼치기' : '숨기기'}
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          {loading && signals.length === 0 && <p style={styles.muted}>불러오는 중…</p>}
          {error && <p style={styles.error}>지표 조회 오류: {error}</p>}
          {!loading && !error && signals.length === 0 && (
            <p style={styles.muted}>
              적재된 지표가 없습니다. 워커 peak-signals이 1회 이상 실행되어야 합니다.
            </p>
          )}

          {signals.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.thLeft}>지표</th>
                  <th style={styles.thRight}>현재값</th>
                  <th style={styles.thRight}>기준값</th>
                  <th style={styles.thCenter}>명중</th>
                  <th style={styles.thProgress}>진행률</th>
                  <th style={styles.thLeft}>비고</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s, idx) => (
                  <Row key={s.signalKey} idx={idx + 1} sig={s} />
                ))}
              </tbody>
            </table>
          )}

          <p style={styles.disclaimer}>
            ※ 통계 표시 전용. 매매 신호가 아닙니다. 각 지표는 데이터 누적 기간이 충분해야 의미를 가지며,
            과거 패턴이 미래를 보장하지 않습니다. <em>insufficient_data</em>는 캔들 누적이 부족한 상태입니다.
          </p>
        </>
      )}
    </section>
  )
}

function Row({ idx, sig }: { idx: number; sig: PeakSignal }) {
  const meta = SIGNAL_META[sig.signalKey] ?? { label: sig.signalKey, desc: '' }
  const insufficient = sig.status === 'insufficient_data'
  const errored = sig.status === 'error'
  const valueColor =
    insufficient || errored
      ? '#a8acb3'
      : sig.hit === true
      ? '#cf202f'
      : '#0a0b0d'

  const unit = meta.unit
  const valueStr = formatValue(sig.value, unit)
  const thresholdStr = formatValue(sig.threshold, unit, /* threshold */ true)

  return (
    <tr style={styles.tr}>
      <td style={styles.tdIdx}>{idx}</td>
      <td style={styles.tdName}>
        <div style={styles.nameMain}>{meta.label}</div>
        <div style={styles.nameDesc}>{meta.desc}</div>
        {insufficient && sig.note && (
          <div style={styles.statusInfo}>데이터 누적 중 ({sig.note})</div>
        )}
        {errored && sig.note && <div style={styles.statusError}>오류: {sig.note}</div>}
      </td>
      <td style={{ ...styles.tdRight, color: valueColor }}>{valueStr}</td>
      <td style={styles.tdRightMuted}>{thresholdStr}</td>
      <td style={styles.tdCenter}>
        {sig.threshold === null ? (
          <span style={styles.badgeNeutral}>—</span>
        ) : insufficient ? (
          <span style={styles.badgeMuted}>대기</span>
        ) : errored ? (
          <span style={styles.badgeError}>오류</span>
        ) : sig.hit ? (
          <span style={styles.badgeHit}>명중</span>
        ) : (
          <span style={styles.badgeNeutral}>미명중</span>
        )}
      </td>
      <td style={styles.tdProgress}>
        {sig.progressPct === null ? (
          <span style={styles.muted}>—</span>
        ) : (
          <ProgressBar pct={Math.min(100, Math.max(0, sig.progressPct))} hit={!!sig.hit} />
        )}
      </td>
      <td style={styles.tdNote}>
        {sig.source && <span style={styles.source}>{sig.source}</span>}
      </td>
    </tr>
  )
}

function formatValue(
  v: number | null,
  unit: '%' | '' | 'band' | 'BTC' | 'days' | undefined,
  isThreshold = false,
): string {
  if (v === null) return '—'
  if (unit === '%') return `${v.toFixed(2)}%`
  if (unit === 'band') return isThreshold ? `≥ ${v.toFixed(0)}` : `${v.toFixed(0)} / 7`
  if (unit === 'BTC') {
    if (isThreshold) return '—'
    return `${Math.round(v).toLocaleString('en-US')} BTC`
  }
  if (unit === 'days') return `${v.toFixed(0)}일`
  // 무차원 비율 — 값 크기에 따라 정밀도 가변.
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(2)
  if (abs >= 10) return v.toFixed(3)
  if (abs >= 1) return v.toFixed(4)
  return v.toFixed(4)
}

function ProgressBar({ pct, hit }: { pct: number; hit: boolean }) {
  return (
    <div style={styles.progressWrap}>
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${pct}%`,
            background: hit ? '#cf202f' : '#0052ff',
          }}
        />
      </div>
      <span style={styles.progressLabel}>{pct.toFixed(0)}%</span>
    </div>
  )
}

const numberFont = "'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace"

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginTop: '24px',
    padding: '32px',
    background: '#ffffff',
    border: '1px solid #dee1e6',
    borderRadius: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 600,
    color: '#0a0b0d',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: '#7c828a',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
  },
  summary: {
    display: 'flex',
    gap: '20px',
    padding: '14px 20px',
    background: '#f7f7f7',
    borderRadius: '16px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: '12px',
  },
  toggleButton: {
    padding: '6px 14px',
    background: '#eef0f3',
    border: 'none',
    borderRadius: '100px',
    color: '#0a0b0d',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: '64px',
    height: '32px',
    whiteSpace: 'nowrap',
  },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  summaryLabel: {
    fontSize: '11px',
    color: '#5b616e',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    fontWeight: 600,
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: 600,
    fontFamily: numberFont,
    color: '#0a0b0d',
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  summarySep: { color: '#a8acb3', fontSize: '16px' },
  summaryTotal: { color: '#5b616e', fontSize: '16px' },

  muted: { color: '#5b616e', fontSize: '14px' },
  error: {
    padding: '12px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    color: '#cf202f',
    fontSize: '14px',
  },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'center',
    padding: '12px 8px',
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    width: '32px',
  },
  thLeft: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  thRight: {
    textAlign: 'right',
    padding: '12px 16px',
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  thCenter: {
    textAlign: 'center',
    padding: '12px 16px',
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    width: '72px',
    minWidth: '72px',
  },
  thProgress: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    borderBottom: '1px solid #dee1e6',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    width: '180px',
  },

  tr: { borderBottom: '1px solid #eef0f3' },
  tdIdx: {
    textAlign: 'center',
    padding: '16px 8px',
    fontSize: '13px',
    color: '#7c828a',
    fontFamily: numberFont,
    verticalAlign: 'top',
  },
  tdName: { padding: '16px', verticalAlign: 'top' },
  nameMain: { fontSize: '15px', fontWeight: 600, color: '#0a0b0d' },
  nameDesc: { fontSize: '12px', color: '#5b616e', marginTop: '4px', lineHeight: 1.5 },
  statusInfo: {
    marginTop: '6px',
    fontSize: '11px',
    color: '#0052ff',
    background: '#e5edff',
    padding: '2px 8px',
    borderRadius: '100px',
    display: 'inline-block',
    fontWeight: 600,
  },
  statusError: {
    marginTop: '6px',
    fontSize: '11px',
    color: '#cf202f',
    background: '#fef2f2',
    padding: '2px 8px',
    borderRadius: '100px',
    display: 'inline-block',
    fontWeight: 600,
  },
  tdRight: {
    padding: '16px',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: numberFont,
    textAlign: 'right',
    verticalAlign: 'top',
  },
  tdRightMuted: {
    padding: '16px',
    fontSize: '14px',
    color: '#5b616e',
    fontFamily: numberFont,
    textAlign: 'right',
    verticalAlign: 'top',
  },
  tdCenter: {
    padding: '16px',
    textAlign: 'center',
    verticalAlign: 'top',
    minWidth: '72px',
  },
  tdProgress: { padding: '16px', verticalAlign: 'top' },
  tdNote: { padding: '16px', verticalAlign: 'top' },
  source: {
    fontSize: '11px',
    color: '#5b616e',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },

  badgeHit: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    minWidth: '48px',
    padding: '4px 12px',
    background: '#fee2e2',
    color: '#cf202f',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 700,
  },
  badgeNeutral: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    minWidth: '48px',
    padding: '4px 12px',
    background: '#eef0f3',
    color: '#5b616e',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 600,
  },
  badgeMuted: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    minWidth: '48px',
    padding: '4px 12px',
    background: '#e5edff',
    color: '#0052ff',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 600,
  },
  badgeError: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    minWidth: '48px',
    padding: '4px 12px',
    background: '#fef2f2',
    color: '#cf202f',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 600,
  },

  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  progressTrack: {
    flex: 1,
    height: '6px',
    background: '#eef0f3',
    borderRadius: '100px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease',
    borderRadius: '100px',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#5b616e',
    fontFamily: numberFont,
    fontWeight: 600,
    minWidth: '40px',
    textAlign: 'right',
  },

  disclaimer: {
    marginTop: '20px',
    fontSize: '12px',
    color: '#7c828a',
    lineHeight: 1.6,
  },
}
