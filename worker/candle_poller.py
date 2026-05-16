# CoinGecko /coins/{id}/market_chart에서 일봉 close+volume을 받아 Supabase candles에 적재한다.
# Stage 2-B. timeframe='1d' 고정. open/high/low는 close와 동일값으로 채워 NOT NULL을 만족시킨다.
#
# 환경변수
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#   POLL_SYMBOLS      — "BTC,ETH,SOL" 형식. price_poller와 동일 매핑(coingecko_ids.py).
#   POLL_ONCE         — "1"이면 1회 실행 후 종료 (GitHub Actions).
#   POLL_INTERVAL_SECONDS — 무한 루프 시 간격 (기본 86400 = 24h).
#   CANDLE_DAYS       — 1회 호출 시 가져올 일수 (기본 2 — 어제·오늘. UPSERT라 중복 안전).
#
# 실행
#   POLL_ONCE=1 python candle_poller.py
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
HTTP_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0
TIMEFRAME = "1d"


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[candles] received signal {signum}, will exit after current loop", flush=True)


def fetch_market_chart(coingecko_id: str, days: int) -> list[dict] | None:
    """/coins/{id}/market_chart 호출. 각 일봉을 dict 리스트로 반환.
    각 dict: {open_time(iso), close(float), volume(float|None)}."""
    params = {
        "vs_currency": "usd",
        "days": str(days),
        "interval": "daily",
    }
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(f"{COINGECKO_BASE}/coins/{coingecko_id}/market_chart", params=params)
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(
                        f"[candles] 429 rate-limited for {coingecko_id}, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s",
                        flush=True,
                    )
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                body = resp.json()
            prices = body.get("prices") or []
            volumes_by_ts: dict[int, float] = {
                int(ts): float(v) for ts, v in (body.get("total_volumes") or [])
            }
            rows: list[dict] = []
            for ts_ms, close in prices:
                ts_ms_i = int(ts_ms)
                open_time = datetime.fromtimestamp(ts_ms_i / 1000, tz=timezone.utc).isoformat()
                close_f = float(close)
                rows.append({
                    "open_time": open_time,
                    "close": close_f,
                    "volume": volumes_by_ts.get(ts_ms_i),
                })
            return rows
        except (httpx.HTTPError, ValueError, TypeError, KeyError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(
                f"[candles] fetch error for {coingecko_id} ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s",
                flush=True,
            )
            time.sleep(wait)
    print(f"[candles] fetch failed for {coingecko_id} after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None


def upsert_candles(supabase: Client, symbol: str, rows: list[dict]) -> int:
    """rows를 candles 테이블에 UPSERT. 적재된 행 수 반환 (실패 시 0)."""
    if not rows:
        return 0
    payload: list[dict] = []
    for r in rows:
        close = r["close"]
        payload.append({
            "symbol": symbol,
            "timeframe": TIMEFRAME,
            "open_time": r["open_time"],
            # open/high/low는 close와 동일값. NOT NULL 만족 + line chart 표현엔 충분.
            "open": close,
            "high": close,
            "low": close,
            "close": close,
            "volume": r["volume"],
        })
    try:
        supabase.table("candles").upsert(
            payload, on_conflict="symbol,timeframe,open_time"
        ).execute()
        return len(payload)
    except Exception as e:
        print(f"[candles] supabase upsert error for {symbol}: {e!r}", flush=True)
        return 0


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[candles] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    raw_symbols = os.getenv("POLL_SYMBOLS", "BTC,ETH,SOL")
    symbols = [s for s in (raw_symbols.split(",") if raw_symbols else []) if s.strip()]
    symbol_to_cg = resolve_ids(symbols)
    if not symbol_to_cg:
        print(f"[candles] FATAL no resolvable symbols from POLL_SYMBOLS={raw_symbols!r}", flush=True)
        return 1

    days = int(os.getenv("CANDLE_DAYS", "2"))
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(24 * 3600)))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(
        f"[candles] start interval={interval}s symbols={list(symbol_to_cg.keys())} "
        f"days={days} once={once}",
        flush=True,
    )

    while True:
        total = 0
        for symbol, cg_id in symbol_to_cg.items():
            rows = fetch_market_chart(cg_id, days)
            if rows is None:
                print(f"[candles] skip {symbol} (fetch failed)", flush=True)
                continue
            inserted = upsert_candles(supabase, symbol, rows)
            total += inserted
            print(f"[candles] {symbol}: upserted={inserted} rows", flush=True)
        print(f"[candles] tick total_upserted={total}", flush=True)

        if once or _shutdown:
            break

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[candles] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
