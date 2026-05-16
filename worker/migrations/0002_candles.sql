-- 일/시간/분 단위 OHLCV 캔들을 저장하는 테이블. timeframe 컬럼으로 다중 시간대 수용.
-- 시작은 '1d' 일봉만 적재하지만 스키마는 확장 가능하게 둔다.

-- 0001_init.sql과 동일한 패턴: 단일 테이블 + UNIQUE + 인덱스 + RLS 정책 2종.

create table if not exists public.candles (
  id           bigserial primary key,
  symbol       text        not null,
  timeframe    text        not null,
  open_time    timestamptz not null,
  open         numeric     not null,
  high         numeric     not null,
  low          numeric     not null,
  close        numeric     not null,
  -- CoinGecko /ohlc 엔드포인트는 volume을 제공하지 않는다. NULL 허용으로 두고,
  -- /market_chart로 별도 적재 시 채우는 전략. 지표 계산은 close 위주라 영향 적다.
  volume       numeric,
  fetched_at   timestamptz not null default now(),

  -- timeframe은 확장 가능한 enum 대신 CHECK 제약으로 허용 목록만 강제한다.
  constraint candles_timeframe_check
    check (timeframe in ('1m', '5m', '15m', '1h', '4h', '1d')),

  -- 동일 (symbol, timeframe, open_time)은 1건만. 재실행해도 멱등.
  constraint candles_symbol_timeframe_open_time_unique
    unique (symbol, timeframe, open_time)
);

-- 최신 캔들 N건 조회를 위한 정렬 인덱스. price_snapshots 인덱스 패턴 동일.
create index if not exists candles_symbol_timeframe_open_time_desc_idx
  on public.candles (symbol, timeframe, open_time desc);

-- RLS 활성화. policy 미정의 상태에서 활성화하면 read 도 차단된다.
alter table public.candles enable row level security;

-- 로그인 사용자는 캔들을 읽을 수 있다 (포트폴리오 차트/지표 조회용).
-- 익명(anon)은 차단. price_snapshots와 동일 정책.
create policy candles_authenticated_select
  on public.candles
  for select
  to authenticated
  using (true);

-- 워커(service_role)만 적재할 수 있다.
create policy candles_service_role_write
  on public.candles
  for all
  to service_role
  using (true)
  with check (true);
