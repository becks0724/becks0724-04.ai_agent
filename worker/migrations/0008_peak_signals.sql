-- 강세장 정점 신호(Bull Market Peak Signals) 일별 적재 테이블.
-- 각 지표(signal_key)별로 매일 captured_at 1행 멱등 적재.
-- value/threshold/hit/progress는 지표마다 의미가 다르므로 numeric 자유 저장.

create table if not exists public.peak_signals (
  id            bigserial   primary key,

  -- 'btc_dominance' | 'mayer_multiple' | 'pi_cycle_top' | 'altcoin_season_index' | ...
  signal_key    text        not null,

  -- 현재 측정값. status='insufficient_data'이면 null 가능.
  value         numeric,
  -- '명중' 임계값. 정의가 없는 지표(예: BTC 도미넌스)는 null.
  threshold     numeric,
  -- value가 threshold를 충족했는지. threshold가 null이면 null.
  hit           boolean,
  -- threshold 대비 진행률(%). 0-100, value/threshold * 100. 일부 지표만 의미 있음.
  progress_pct  numeric,

  -- 'coingecko' | 'cmc' | 'computed' | 'bitcoin-data' | 'alternative.me'
  source        text        not null,
  -- 'ok' | 'insufficient_data' | 'error' — 데이터 부족·에러 시에도 행은 적재해 추적.
  status        text        not null default 'ok',
  -- 자유 텍스트. 에러 메시지 또는 추가 컨텍스트.
  note          text,

  -- 데이터 기준 시각(보통 00:00 UTC). 같은 signal_key + captured_at은 1건만.
  captured_at   timestamptz not null,
  -- 워커 실행 시각.
  fetched_at    timestamptz not null default now(),

  constraint peak_signals_signal_captured_unique
    unique (signal_key, captured_at),
  constraint peak_signals_status_check
    check (status in ('ok', 'insufficient_data', 'error'))
);

create index if not exists peak_signals_signal_captured_desc_idx
  on public.peak_signals (signal_key, captured_at desc);

create index if not exists peak_signals_captured_desc_idx
  on public.peak_signals (captured_at desc);

alter table public.peak_signals enable row level security;

-- 로그인 사용자는 지표를 읽을 수 있다.
create policy peak_signals_authenticated_select
  on public.peak_signals
  for select
  to authenticated
  using (true);

-- 워커(service_role)만 적재할 수 있다.
create policy peak_signals_service_role_write
  on public.peak_signals
  for all
  to service_role
  using (true)
  with check (true);
