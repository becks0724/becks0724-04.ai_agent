-- 외부 RSS·뉴스 API에서 수집한 기사 본문과 보유 종목 매핑을 저장한다.
-- 워커가 RSS/CryptoPanic을 폴링해 news에 UPSERT(url UNIQUE)하고, 제목/본문 심볼 매칭 결과를 news_ticker_map에 적재한다.

create table if not exists public.news (
  id            bigserial   primary key,
  source        text        not null,
  title         text        not null,
  url           text        not null,
  published_at  timestamptz,
  raw_content   text,
  fetched_at    timestamptz not null default now(),

  constraint news_url_unique unique (url)
);

create index if not exists news_published_at_desc_idx
  on public.news (published_at desc nulls last);

alter table public.news enable row level security;

create policy news_authenticated_select
  on public.news
  for select
  to authenticated
  using (true);

create policy news_service_role_write
  on public.news
  for all
  to service_role
  using (true)
  with check (true);


-- 기사 ↔ 심볼 N:M 매핑. 한 기사에 여러 심볼이 매칭될 수 있다.
create table if not exists public.news_ticker_map (
  news_id  bigint not null references public.news (id) on delete cascade,
  symbol   text   not null,
  primary key (news_id, symbol)
);

create index if not exists news_ticker_map_symbol_idx
  on public.news_ticker_map (symbol);

alter table public.news_ticker_map enable row level security;

create policy news_ticker_map_authenticated_select
  on public.news_ticker_map
  for select
  to authenticated
  using (true);

create policy news_ticker_map_service_role_write
  on public.news_ticker_map
  for all
  to service_role
  using (true)
  with check (true);
