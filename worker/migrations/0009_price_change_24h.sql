-- Stage 1 price snapshots extension.
-- CoinGecko /simple/price include_24hr_change=true 응답의 usd_24h_change를 저장한다.
-- 기존 행은 backfill하지 않으므로 nullable.

alter table public.price_snapshots
  add column if not exists price_change_24h_pct numeric(12, 6);
