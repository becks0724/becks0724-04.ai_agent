# CoinGecko /coins/markets에서 시총 상위 N개(기본 5000) 메타데이터를 받아 coins_catalog에 upsert한다.
# 일 1회 실행으로 충분. 페이지간 sleep으로 무료 plan rate limit 회피.
#
# 환경변수 (worker/.env 또는 GitHub Actions Secrets)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트 (RLS 우회)
#   POLL_ONCE                                — "1"이면 1회 실행 후 종료
#   POLL_INTERVAL_SECONDS                    — 무한 루프 시 간격 (기본 86400)
#   CATALOG_TOTAL                            — 적재할 최대 항목 수 (기본 5000)
#   CATALOG_PER_PAGE                         — per_page (기본 250, CoinGecko 무료 plan 한도)
#   CATALOG_PAGE_SLEEP_SECONDS               — 페이지간 sleep (기본 4.0초, CoinGecko 무료 plan은 2초 미만에서 429 빈발)
#   CATALOG_RETRY_COOLDOWN_SECONDS           — 1차 패스 후 누락 페이지 재시도 전 대기 (기본 60초)
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
# CoinGecko 무료 plan은 짧은 간격에서 429를 자주 낸다. 백오프를 길게(4/16/64초) 잡아 cooldown 확보.
BACKOFF_BASE_SECONDS = 4.0


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


def _process_pages(
    supabase: Client,
    pages_to_fetch: list[int],
    total_pages: int,
    per_page: int,
    page_sleep: float,
    now_iso: str,
    label: str,
) -> tuple[int, list[int]]:
    """주어진 페이지 목록을 순회. (적재된 행 합계, 실패한 페이지 리스트) 반환."""
    inserted_sum = 0
    failed: list[int] = []
    for idx, page in enumerate(pages_to_fetch):
        if _shutdown:
            break
        entries = fetch_markets_page(page, per_page)
        if entries is None:
            print(f"[catalog] {label} page={page} skipped (fetch failed)", flush=True)
            failed.append(page)
        else:
            rows = [r for r in (normalize_entry(e, now_iso) for e in entries) if r is not None]
            if not rows:
                print(f"[catalog] {label} page={page} empty after normalize (entries={len(entries)})", flush=True)
            else:
                got = upsert_chunk(supabase, rows)
                inserted_sum += got
                print(
                    f"[catalog] {label} page={page}/{total_pages} upserted={got}/{len(entries)}",
                    flush=True,
                )
        # 다음 페이지 전 sleep. 마지막 페이지 뒤엔 생략.
        if idx + 1 < len(pages_to_fetch):
            time.sleep(page_sleep)
    return inserted_sum, failed


def run_once(supabase: Client, total: int, per_page: int, page_sleep: float, retry_cooldown: float) -> int:
    """한 번의 catalog 갱신 사이클. 1차 패스 후 누락 페이지 1회 재시도. 적재된 행 수 합계 반환."""
    pages = (total + per_page - 1) // per_page
    now_iso = datetime.now(timezone.utc).isoformat()

    first_inserted, failed = _process_pages(
        supabase, list(range(1, pages + 1)), pages, per_page, page_sleep, now_iso, "pass1"
    )
    print(f"[catalog] pass1 done inserted={first_inserted} failed_pages={failed}", flush=True)

    grand_total = first_inserted
    if failed and not _shutdown:
        print(f"[catalog] cooldown {retry_cooldown:.0f}s before retry pass", flush=True)
        time.sleep(retry_cooldown)
        retry_inserted, still_failed = _process_pages(
            supabase, failed, pages, per_page, page_sleep, now_iso, "pass2"
        )
        grand_total += retry_inserted
        print(f"[catalog] pass2 done inserted={retry_inserted} still_failed={still_failed}", flush=True)

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
    page_sleep = float(os.getenv("CATALOG_PAGE_SLEEP_SECONDS", "4.0"))
    retry_cooldown = float(os.getenv("CATALOG_RETRY_COOLDOWN_SECONDS", "60.0"))
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(24 * 3600)))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(
        f"[catalog] start total={total} per_page={per_page} page_sleep={page_sleep}s "
        f"retry_cooldown={retry_cooldown}s once={once}",
        flush=True,
    )

    while True:
        upserted = run_once(supabase, total, per_page, page_sleep, retry_cooldown)
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
