-- 캔들 기반 기술적 지표(RSI/MACD)를 적재하는 테이블.
-- 워커가 candles 테이블을 읽어 pandas로 계산 후 UPSERT한다.

create table if not exists public.indicators (
  id            bigserial   primary key,
  symbol        text        not null,
  timeframe     text        not null,
  open_time     timestamptz not null,
  -- 데이터가 부족한 초기 row는 NULL 허용. RSI 14는 최소 14건, MACD 26+9는 최소 35건 필요.
  rsi_14        numeric,
  macd          numeric,
  macd_signal   numeric,
  macd_hist     numeric,
  computed_at   timestamptz not null default now(),

  constraint indicators_timeframe_check
    check (timeframe in ('1m', '5m', '15m', '1h', '4h', '1d')),
  constraint indicators_symbol_timeframe_open_time_unique
    unique (symbol, timeframe, open_time)
);

create index if not exists indicators_symbol_timeframe_open_time_desc_idx
  on public.indicators (symbol, timeframe, open_time desc);

alter table public.indicators enable row level security;

create policy indicators_authenticated_select
  on public.indicators
  for select
  to authenticated
  using (true);

create policy indicators_service_role_write
  on public.indicators
  for all
  to service_role
  using (true)
  with check (true);
