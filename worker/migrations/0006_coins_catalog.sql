-- 시총 5000위까지 코인 메타데이터를 보관해 동적 심볼 매핑과 프론트 자동완성에 사용한다.
-- 워커가 CoinGecko /coins/markets를 일 1회 폴링해 upsert 한다.

create table if not exists public.coins_catalog (
  coingecko_id     text        primary key,
  symbol           text        not null,
  name             text        not null,
  image_url        text,
  market_cap_rank  int,
  updated_at       timestamptz not null default now()
);

-- 심볼(BTC 등)당 market_cap_rank가 가장 낮은(=상위) 행을 찾는 용도.
-- nulls last로 두면 rank가 빠진 코인은 뒤로 밀린다.
create index if not exists coins_catalog_symbol_rank_idx
  on public.coins_catalog (symbol, market_cap_rank asc nulls last);

-- 전체 정렬 + 자동완성 limit 용도.
create index if not exists coins_catalog_rank_idx
  on public.coins_catalog (market_cap_rank asc nulls last);

-- 부분 일치 자동완성용 (ilike 검색). symbol·name 모두 prefix 검색 효율 향상.
create index if not exists coins_catalog_symbol_lower_idx
  on public.coins_catalog (lower(symbol));
create index if not exists coins_catalog_name_lower_idx
  on public.coins_catalog (lower(name));

alter table public.coins_catalog enable row level security;

create policy coins_catalog_authenticated_select
  on public.coins_catalog
  for select
  to authenticated
  using (true);

create policy coins_catalog_service_role_write
  on public.coins_catalog
  for all
  to service_role
  using (true)
  with check (true);
