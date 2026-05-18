-- LLM(Claude Haiku 4.5)으로 분류한 뉴스 감성·이벤트 카테고리 결과를 저장한다.
-- news_id 1:1 매핑. 동일 뉴스 재분류 시 model_id가 바뀌면 갱신, 같으면 skip.

create table if not exists public.news_classifications (
  news_id         bigint      primary key references public.news (id) on delete cascade,
  sentiment       text        not null,
  event_category  text        not null,
  confidence      numeric,
  model_id        text        not null,
  classified_at   timestamptz not null default now(),

  constraint news_classifications_sentiment_check
    check (sentiment in ('positive', 'neutral', 'negative')),
  constraint news_classifications_event_category_check
    check (event_category in ('listing', 'regulation', 'hack', 'partnership', 'tech', 'general'))
);

create index if not exists news_classifications_sentiment_idx
  on public.news_classifications (sentiment);
create index if not exists news_classifications_event_category_idx
  on public.news_classifications (event_category);

alter table public.news_classifications enable row level security;

create policy news_classifications_authenticated_select
  on public.news_classifications
  for select
  to authenticated
  using (true);

create policy news_classifications_service_role_write
  on public.news_classifications
  for all
  to service_role
  using (true)
  with check (true);
