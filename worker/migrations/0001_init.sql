-- Stage 1-A 초기 마이그레이션. portfolio_holdings, price_snapshots 테이블 + RLS 정책.
-- 적용 방법.
--   1) Supabase Dashboard → SQL Editor → 본 파일 내용 붙여넣기 → Run.
--   2) 또는 supabase CLI를 사용한다면 `supabase db push` 흐름에 맞춰 별도 관리한다.
--
-- 안전 기준.
--   - 모든 데이터 테이블에 RLS 활성화. 본인 행만 접근.
--   - price_snapshots는 worker(service_role) 적재 + 인증 사용자 읽기 전용.
--   - 모든 user_id 컬럼은 auth.users(id) FK + ON DELETE CASCADE.

-- =============================================================
-- 1. portfolio_holdings — 사용자가 수동 입력한 보유 자산
-- =============================================================
create table if not exists public.portfolio_holdings (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    symbol          text not null,
    quantity        numeric(36, 18) not null check (quantity >= 0),
    avg_buy_price   numeric(20, 8)  not null check (avg_buy_price >= 0),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- 동일 사용자가 동일 심볼을 중복 등록하지 못하도록 제약.
    -- 동일 심볼을 추가 매수한 경우 quantity / avg_buy_price를 UPDATE 한다.
    constraint portfolio_holdings_user_symbol_unique unique (user_id, symbol)
);

create index if not exists portfolio_holdings_user_id_idx
    on public.portfolio_holdings (user_id);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists portfolio_holdings_set_updated_at on public.portfolio_holdings;
create trigger portfolio_holdings_set_updated_at
    before update on public.portfolio_holdings
    for each row
    execute function public.set_updated_at();

-- RLS — 본인 행만 접근
alter table public.portfolio_holdings enable row level security;

drop policy if exists "portfolio_holdings: select own"     on public.portfolio_holdings;
drop policy if exists "portfolio_holdings: insert own"     on public.portfolio_holdings;
drop policy if exists "portfolio_holdings: update own"     on public.portfolio_holdings;
drop policy if exists "portfolio_holdings: delete own"     on public.portfolio_holdings;

create policy "portfolio_holdings: select own"
    on public.portfolio_holdings
    for select
    using (auth.uid() = user_id);

create policy "portfolio_holdings: insert own"
    on public.portfolio_holdings
    for insert
    with check (auth.uid() = user_id);

create policy "portfolio_holdings: update own"
    on public.portfolio_holdings
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "portfolio_holdings: delete own"
    on public.portfolio_holdings
    for delete
    using (auth.uid() = user_id);


-- =============================================================
-- 2. price_snapshots — 워커가 적재하는 시세 스냅샷
-- =============================================================
create table if not exists public.price_snapshots (
    id          bigserial primary key,
    symbol      text not null,
    price_usd   numeric(20, 8) not null check (price_usd >= 0),
    fetched_at  timestamptz not null default now()
);

-- 최신 시세 조회 최적화 (symbol별 최근 시점).
create index if not exists price_snapshots_symbol_fetched_at_idx
    on public.price_snapshots (symbol, fetched_at desc);

-- RLS — 인증 사용자는 읽기만, 쓰기는 service_role 전용.
alter table public.price_snapshots enable row level security;

drop policy if exists "price_snapshots: select for authenticated" on public.price_snapshots;

create policy "price_snapshots: select for authenticated"
    on public.price_snapshots
    for select
    to authenticated
    using (true);

-- INSERT/UPDATE/DELETE 정책은 정의하지 않는다.
-- service_role 키는 RLS를 우회하므로 worker는 정상 동작한다.
-- anon/authenticated 클라이언트는 쓰기 차단된다.
