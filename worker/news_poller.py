# RSS 피드 4종(CoinDesk/Cointelegraph/Bitcoin Magazine/Decrypt)에서 최신 기사를 적재하는 워커.
# news 테이블에 url unique upsert, 제목+요약 기준 심볼 매칭 결과를 news_ticker_map에 적재한다.
#
# 환경변수 (worker/.env 또는 GitHub Actions Secrets)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트 (RLS 우회)
#   POLL_ONCE                                — "1"이면 1회만 실행 후 종료
#   POLL_INTERVAL_SECONDS                    — 무한 루프 시 간격 (기본 3600 = 1h)
#   NEWS_FEEDS                               — 콤마 구분 URL 오버라이드 (옵션, 없으면 DEFAULT_FEEDS)
#
# 실행
#   POLL_ONCE=1 python news_poller.py
from __future__ import annotations

import os
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any

import feedparser
import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

from ticker_matcher import extract_symbols

HTTP_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0

DEFAULT_FEEDS: list[tuple[str, str]] = [
    ("coindesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("cointelegraph", "https://cointelegraph.com/rss"),
    ("bitcoinmagazine", "https://bitcoinmagazine.com/.rss/full/"),
    ("decrypt", "https://decrypt.co/feed"),
]


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[news] received signal {signum}, will exit after current loop", flush=True)


def fetch_feed(url: str) -> bytes | None:
    """RSS 피드 본문을 bytes로 받아온다. 429/네트워크 오류 시 지수 백오프 재시도."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
                resp = client.get(url, headers={"User-Agent": "crypto-monitoring/0.1 (+news)"})
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[news] 429 rate-limited for {url}, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.content
        except httpx.HTTPError as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[news] fetch error for {url} ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[news] fetch failed for {url} after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None


def parse_entries(content: bytes, source: str) -> list[dict[str, Any]]:
    """feedparser로 파싱해 news upsert에 필요한 dict 리스트로 정규화한다."""
    parsed = feedparser.parse(content)
    rows: list[dict[str, Any]] = []
    for entry in parsed.entries:
        url = (entry.get("link") or "").strip()
        title = (entry.get("title") or "").strip()
        if not url or not title:
            continue

        # published_parsed는 struct_time. 누락 시 None으로 둔다(컬럼 nullable).
        published_at: str | None = None
        pp = entry.get("published_parsed") or entry.get("updated_parsed")
        if pp:
            try:
                published_at = datetime(*pp[:6], tzinfo=timezone.utc).isoformat()
            except (TypeError, ValueError):
                published_at = None

        # raw_content는 summary 우선, 없으면 content[0].value. 일부 피드는 HTML 포함 — 그대로 저장.
        raw = entry.get("summary") or ""
        if not raw:
            contents = entry.get("content") or []
            if contents:
                raw = contents[0].get("value", "") if isinstance(contents[0], dict) else ""

        rows.append({
            "source": source,
            "title": title,
            "url": url,
            "published_at": published_at,
            "raw_content": raw or None,
        })
    return rows


def upsert_news_with_tickers(supabase: Client, row: dict[str, Any]) -> tuple[bool, int]:
    """news upsert + 매칭된 심볼을 news_ticker_map에 적재. (성공여부, 매칭심볼수)."""
    try:
        result = supabase.table("news").upsert(row, on_conflict="url").execute()
        if not result.data:
            print(f"[news] upsert returned empty data for url={row['url']!r}", flush=True)
            return (False, 0)
        news_id = result.data[0]["id"]
    except Exception as e:
        code = getattr(e, "code", None)
        message = getattr(e, "message", None) or str(e)
        print(f"[news] news upsert error for url={row['url']!r}: code={code!r} message={message!r}", flush=True)
        return (False, 0)

    # 제목 + 본문에서 심볼 추출. 본문은 HTML 포함이지만 word boundary는 태그 안에도 매칭 가능 → 무해.
    text = f"{row.get('title', '')} {row.get('raw_content') or ''}"
    symbols = extract_symbols(text)
    if not symbols:
        return (True, 0)

    map_rows = [{"news_id": news_id, "symbol": s} for s in symbols]
    try:
        supabase.table("news_ticker_map").upsert(map_rows, on_conflict="news_id,symbol").execute()
        return (True, len(symbols))
    except Exception as e:
        code = getattr(e, "code", None)
        message = getattr(e, "message", None) or str(e)
        print(f"[news] ticker_map upsert error for news_id={news_id} symbols={symbols}: code={code!r} message={message!r}", flush=True)
        return (True, 0)


def run_once(supabase: Client, feeds: list[tuple[str, str]]) -> tuple[int, int, int]:
    """1회 폴링. (총 fetched, news upserted, ticker map rows) 반환."""
    total_entries = 0
    total_upserted = 0
    total_mapped = 0
    for source, url in feeds:
        content = fetch_feed(url)
        if content is None:
            print(f"[news] {source}: skipped (fetch failed)", flush=True)
            continue
        rows = parse_entries(content, source)
        total_entries += len(rows)
        upserted_here = 0
        mapped_here = 0
        for row in rows:
            ok, mapped = upsert_news_with_tickers(supabase, row)
            if ok:
                upserted_here += 1
                mapped_here += mapped
        total_upserted += upserted_here
        total_mapped += mapped_here
        print(
            f"[news] {source}: entries={len(rows)} upserted={upserted_here} ticker_links={mapped_here}",
            flush=True,
        )
    return (total_entries, total_upserted, total_mapped)


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[news] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    interval = int(os.getenv("POLL_INTERVAL_SECONDS", "3600"))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    feeds_env = os.getenv("NEWS_FEEDS", "").strip()
    if feeds_env:
        # "source1|url1,source2|url2" 또는 "url1,url2" 형식. 후자는 source=domain.
        feeds: list[tuple[str, str]] = []
        for item in feeds_env.split(","):
            item = item.strip()
            if not item:
                continue
            if "|" in item:
                src, u = item.split("|", 1)
                feeds.append((src.strip(), u.strip()))
            else:
                feeds.append((item, item))
    else:
        feeds = DEFAULT_FEEDS

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(f"[news] start interval={interval}s once={once} feeds={[s for s, _ in feeds]}", flush=True)

    while True:
        entries, upserted, mapped = run_once(supabase, feeds)
        print(f"[news] tick total entries={entries} upserted={upserted} ticker_links={mapped}", flush=True)

        if once or _shutdown:
            break

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[news] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
