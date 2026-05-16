# Alternative.me 공포·탐욕 지수를 폴링해 Supabase fear_greed 테이블에 적재하는 워커.
# Stage 2-C. 일 1회면 충분 (API도 하루 1회 갱신).
#
# 환경변수 (worker/.env 또는 GitHub Actions Secrets)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트 (RLS 우회)
#   POLL_ONCE                                — "1"이면 1회만 실행 후 종료 (GitHub Actions / 로컬 검증)
#   POLL_INTERVAL_SECONDS                    — 무한 루프 시 간격 (기본 86400 = 24h)
#
# 실행
#   POLL_ONCE=1 python fear_greed_poller.py
from __future__ import annotations

import os
import signal
import sys
import time
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

ALTERNATIVE_ME_URL = "https://api.alternative.me/fng/?limit=1"
HTTP_TIMEOUT_SECONDS = 10.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[fng] received signal {signum}, will exit after current loop", flush=True)


def fetch_index() -> dict | None:
    """Alternative.me /fng를 호출해 최신 1건의 dict를 돌려준다.
    실패 시 None. dict 구조 — {value, classification, captured_at(iso)}."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(ALTERNATIVE_ME_URL)
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[fng] 429 rate-limited, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                body = resp.json()
            data = body.get("data") or []
            if not data:
                print(f"[fng] empty data array in response: {body!r}", flush=True)
                return None
            first = data[0]
            value = int(first["value"])
            classification = str(first["value_classification"])
            ts = int(first["timestamp"])
            captured_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            return {
                "value": value,
                "classification": classification,
                "captured_at": captured_at,
            }
        except (httpx.HTTPError, ValueError, KeyError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[fng] fetch error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[fng] fetch failed after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None


def upsert_index(supabase: Client, row: dict) -> bool:
    """captured_at 기준 upsert. 같은 시각의 데이터를 여러 번 적재해도 1건만 유지."""
    try:
        supabase.table("fear_greed").upsert(row, on_conflict="captured_at").execute()
        return True
    except Exception as e:
        print(f"[fng] supabase upsert error: {e!r}", flush=True)
        return False


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[fng] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(24 * 3600)))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(f"[fng] start interval={interval}s once={once}", flush=True)

    while True:
        row = fetch_index()
        if row is None:
            print("[fng] tick skipped (fetch failed)", flush=True)
        else:
            ok = upsert_index(supabase, row)
            print(
                f"[fng] tick upserted={int(ok)} value={row['value']} "
                f"classification={row['classification']!r} captured_at={row['captured_at']}",
                flush=True,
            )

        if once or _shutdown:
            break

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[fng] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
