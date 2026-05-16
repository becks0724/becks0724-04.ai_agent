# CoinGecko /simple/price를 폴링해 Supabase price_snapshots에 적재하는 워커.
# Stage 1-B MVP. Stage 5에서 WebSocket으로 교체될 가능성.
#
# 환경변수 (worker/.env)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트 (RLS 우회)
#   POLL_INTERVAL_SECONDS                    — 폴링 간격 (기본 30초)
#   POLL_SYMBOLS                             — "BTC,ETH,SOL" 형식
#   POLL_ONCE                                — "1"이면 1회만 실행 후 종료 (로컬 검증용)
#
# 실행
#   python price_poller.py            # 무한 루프
#   POLL_ONCE=1 python price_poller.py  # 1회 실행 후 종료
from __future__ import annotations

import os
import signal
import sys
import time
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

from coingecko_ids import resolve_ids

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
HTTP_TIMEOUT_SECONDS = 10.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0  # 2, 4, 8...


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[poller] received signal {signum}, will exit after current loop", flush=True)


def fetch_prices(coingecko_ids: list[str]) -> dict[str, float]:
    """CoinGecko /simple/price 호출. id별 USD 가격을 dict로 반환."""
    if not coingecko_ids:
        return {}
    params = {
        "ids": ",".join(coingecko_ids),
        "vs_currencies": "usd",
    }
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(f"{COINGECKO_BASE}/simple/price", params=params)
                if resp.status_code == 429:
                    # rate limit. 지수 백오프.
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[poller] 429 rate-limited, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
            out: dict[str, float] = {}
            for cg_id, payload in data.items():
                usd = payload.get("usd")
                if isinstance(usd, (int, float)):
                    out[cg_id] = float(usd)
            return out
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[poller] fetch error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[poller] fetch failed after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return {}


def insert_snapshots(
    supabase: Client,
    symbol_to_cg: dict[str, str],
    cg_to_price: dict[str, float],
) -> int:
    """symbol별 가격을 price_snapshots에 일괄 insert. 적재된 행 수 반환."""
    rows: list[dict] = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    for symbol, cg_id in symbol_to_cg.items():
        price = cg_to_price.get(cg_id)
        if price is None:
            print(f"[poller] WARN no price for {symbol} (id={cg_id})", flush=True)
            continue
        rows.append({
            "symbol": symbol,
            "price_usd": price,
            "fetched_at": fetched_at,
        })
    if not rows:
        return 0
    try:
        supabase.table("price_snapshots").insert(rows).execute()
        return len(rows)
    except Exception as e:
        print(f"[poller] supabase insert error: {e!r}", flush=True)
        return 0


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[poller] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    raw_symbols = os.getenv("POLL_SYMBOLS", "BTC,ETH,SOL")
    symbols = [s for s in (raw_symbols.split(",") if raw_symbols else []) if s.strip()]
    symbol_to_cg = resolve_ids(symbols)
    if not symbol_to_cg:
        print(f"[poller] FATAL no resolvable symbols from POLL_SYMBOLS={raw_symbols!r}", flush=True)
        return 1

    interval = int(os.getenv("POLL_INTERVAL_SECONDS", "30"))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(
        f"[poller] start interval={interval}s symbols={list(symbol_to_cg.keys())} once={once}",
        flush=True,
    )

    while True:
        cg_to_price = fetch_prices(list(symbol_to_cg.values()))
        inserted = insert_snapshots(supabase, symbol_to_cg, cg_to_price)
        print(f"[poller] tick inserted={inserted}/{len(symbol_to_cg)}", flush=True)

        if once or _shutdown:
            break

        # 인터럽트 응답성 확보를 위해 잘게 sleep.
        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[poller] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
