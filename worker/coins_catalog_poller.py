# CoinGecko /coins/markets에서 시총 상위 N개(기본 5000) 메타데이터를 받아 coins_catalog에 upsert한다.
# 일 1회 실행으로 충분. 페이지간 sleep으로 무료 plan rate limit 회피.
#
# 환경변수 (worker/.env 또는 GitHub Actions Secrets)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트 (RLS 우회)
#   POLL_ONCE                                — "1"이면 1회 실행 후 종료
#   POLL_INTERVAL_SECONDS                    — 무한 루프 시 간격 (기본 86400)
#   CATALOG_TOTAL                            — 적재할 최대 항목 수 (기본 5000)
#   CATALOG_PER_PAGE                         — per_page (기본 250, CoinGecko 무료 plan 한도)
#   CATALOG_PAGE_SLEEP_SECONDS               — 페이지간 sleep (기본 1.5초)
#
# 실행
#   POLL_ONCE=1 python coins_catalog_poller.py
from __future__ import annotations

import os
import signal
import sys
import time
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
HTTP_TIMEOUT_SECONDS = 20.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[catalog] received signal {signum}, will exit after current loop", flush=True)


def fetch_markets_page(page: int, per_page: int) -> list[dict] | None:
    """/coins/markets 한 페이지를 받아 raw entry 리스트 반환. 실패 시 None."""
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": str(per_page),
        "page": str(page),
        "sparkline": "false",
        "price_change_percentage": "",
    }
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(f"{COINGECKO_BASE}/coins/markets", params=params)
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[catalog] 429 page={page}, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                body = resp.json()
            if not isinstance(body, list):
                print(f"[catalog] WARN unexpected body type for page={page}: {type(body).__name__}", flush=True)
                return None
            return body
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[catalog] fetch error page={page} ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[catalog] fetch failed page={page} after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None


def normalize_entry(entry: dict, now_iso: str) -> dict | None:
    """raw API entry를 coins_catalog row로 정규화. 필수 필드 없으면 None."""
    cg_id = entry.get("id")
    symbol = entry.get("symbol")
    name = entry.get("name")
    if not cg_id or not symbol or not name:
        return None
    # symbol은 CoinGecko가 소문자로 주는데 우리 시스템은 UPPER 사용. 매칭은 lower()로 양쪽 처리.
    return {
        "coingecko_id": cg_id,
        "symbol": symbol.upper(),
        "name": name,
        "image_url": entry.get("image"),
        "market_cap_rank": entry.get("market_cap_rank"),
        "updated_at": now_iso,
    }


def upsert_chunk(supabase: Client, rows: list[dict]) -> int:
    """coins_catalog에 upsert. coingecko_id 기준. 적재된 row 수 반환."""
    if not rows:
        return 0
    try:
        supabase.table("coins_catalog").upsert(rows, on_conflict="coingecko_id").execute()
        return len(rows)
    except Exception as e:
        code = getattr(e, "code", None)
        message = getattr(e, "message", None) or str(e)
        print(f"[catalog] upsert error rows={len(rows)} code={code!r} message={message!r}", flush=True)
        return 0


def run_once(supabase: Client, total: int, per_page: int, page_sleep: float) -> int:
    """한 번의 catalog 갱신 사이클. 적재된 행 수 합계 반환."""
    pages = (total + per_page - 1) // per_page
    now_iso = datetime.now(timezone.utc).isoformat()
    grand_total = 0
    for page in range(1, pages + 1):
        if _shutdown:
            break
        entries = fetch_markets_page(page, per_page)
        if entries is None:
            print(f"[catalog] page={page} skipped (fetch failed)", flush=True)
            # rate limit 또는 일시 오류일 수 있으니 다음 페이지로 진행. 무한루프 회피.
            time.sleep(page_sleep)
            continue
        rows = [r for r in (normalize_entry(e, now_iso) for e in entries) if r is not None]
        if not rows:
            print(f"[catalog] page={page} empty after normalize (entries={len(entries)})", flush=True)
            # 빈 페이지면 후속 페이지도 비어있을 가능성 — 안전하게 진행
        else:
            inserted = upsert_chunk(supabase, rows)
            grand_total += inserted
            print(f"[catalog] page={page}/{pages} upserted={inserted}/{len(entries)} cumulative={grand_total}", flush=True)
        # 다음 페이지 전 sleep. CoinGecko 무료 plan rate limit 보호.
        if page < pages:
            time.sleep(page_sleep)
    return grand_total


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[catalog] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    total = int(os.getenv("CATALOG_TOTAL", "5000"))
    per_page = int(os.getenv("CATALOG_PER_PAGE", "250"))
    page_sleep = float(os.getenv("CATALOG_PAGE_SLEEP_SECONDS", "1.5"))
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(24 * 3600)))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(f"[catalog] start total={total} per_page={per_page} page_sleep={page_sleep}s once={once}", flush=True)

    while True:
        upserted = run_once(supabase, total, per_page, page_sleep)
        print(f"[catalog] tick total_upserted={upserted}", flush=True)

        if once or _shutdown:
            break

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[catalog] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
