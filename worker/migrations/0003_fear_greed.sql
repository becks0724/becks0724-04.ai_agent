-- Alternative.me 공포·탐욕 지수(0-100)를 일 단위로 적재하는 테이블.
-- 응답 구조 — { value: "40", value_classification: "Fear", timestamp: "1551157200" }

create table if not exists public.fear_greed (
  id              bigserial   primary key,
  -- 0-100 정수. Alternative.me는 string으로 주지만 워커에서 int로 변환 후 저장.
  value           int         not null,
  -- "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed".
  -- 값은 자유 텍스트로 두고 CHECK은 걸지 않는다 (출처 변동 대응).
  classification  text        not null,
  -- Alternative.me가 돌려주는 unix epoch을 timestamptz로 변환한 값. 보통 00:00 UTC.
  captured_at     timestamptz not null,
  fetched_at      timestamptz not null default now(),

  -- 같은 captured_at은 1건만 (멱등 적재). 워커는 매일 동일 시각의 데이터를 받게 된다.
  constraint fear_greed_captured_at_unique unique (captured_at),

  constraint fear_greed_value_range_check check (value between 0 and 100)
);

create index if not exists fear_greed_captured_at_desc_idx
  on public.fear_greed (captured_at desc);

alter table public.fear_greed enable row level security;

-- 로그인 사용자는 지수를 읽을 수 있다.
create policy fear_greed_authenticated_select
  on public.fear_greed
  for select
  to authenticated
  using (true);

-- 워커(service_role)만 적재할 수 있다.
create policy fear_greed_service_role_write
  on public.fear_greed
  for all
  to service_role
  using (true)
  with check (true);
