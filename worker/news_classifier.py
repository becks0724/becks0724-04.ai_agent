# 미분류 news를 Google Gemini 2.5 Flash로 sentiment + event_category 분류해 news_classifications에 적재한다.
# 가격 예측은 절대 수행하지 않음 — 감성·통계 표시 전용.
#
# 환경변수 (worker/.env 또는 GitHub Actions Secrets)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트
#   GOOGLE_API_KEY                           — Google AI Studio key (https://aistudio.google.com/app/apikey)
#   CLASSIFY_BATCH_SIZE                      — 1회 처리할 미분류 건수 (기본 10, Gemini 무료 일 250건 안전)
#   CLASSIFY_MODEL                           — 모델 ID (기본 gemini-2.5-flash)
#   CLASSIFY_CALL_SLEEP_SECONDS              — 호출 간 sleep (기본 6초, 분당 10 RPM 안전)
#   POLL_ONCE                                — "1"이면 1회 실행 후 종료
#   POLL_INTERVAL_SECONDS                    — 무한 루프 시 간격 (기본 3600)
#
# 실행
#   POLL_ONCE=1 python news_classifier.py
from __future__ import annotations

import json
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from supabase import Client, create_client

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_BATCH = 10
# Gemini Free tier gemini-2.5-flash는 분당 5 RPM. 13초 간격 → 분당 ~4.6 호출로 안전 마진.
DEFAULT_CALL_SLEEP = 13.0
MAX_TOKENS = 500
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 4.0

SENTIMENTS = {"positive", "neutral", "negative"}
EVENT_CATEGORIES = {"listing", "regulation", "hack", "partnership", "tech", "general"}

# 영구 오류 키워드(case-insensitive). "quota exceeded"는 일/분 단위 모두에 등장해 fatal 분류가 부적절.
# 분당 한도는 sleep 후 재시도 가능, 일 한도는 다음 날까지 차단 — 메시지에 "PerDay"가 포함되면 fatal.
FATAL_HINTS = (
    "api key not valid",
    "invalid api key",
    "permission denied",
    "billing",
    "unauthenticated",
    "user location is not supported",
    "perday",  # GenerateRequestsPerDayPerProjectPerModel
)

PROMPT_TEMPLATE = """다음 암호화폐 뉴스를 분류해라. JSON 한 객체로만 응답하고 다른 텍스트는 금지.

제목: {title}
요약: {summary}

스키마:
{{
  "sentiment": "positive|neutral|negative",
  "event_category": "listing|regulation|hack|partnership|tech|general",
  "confidence": 0.0과 1.0 사이 숫자
}}

판단 가이드:
- sentiment — 코인/시장 전반에 호재면 positive, 악재면 negative, 모호하거나 단순 보도면 neutral.
- event_category — 상장/추가 listing, 규제·소송·정책 regulation, 해킹·익스플로잇 hack, 파트너십·통합·투자유치 partnership, 기술·업그레이드·신제품 tech, 그 외 general.
- 매매 신호로 해석하지 않는다. 통계 표시 전용.
"""


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[classifier] received signal {signum}, will exit after current batch", flush=True)


class FatalApiError(Exception):
    """key 만료·결제·권한 등 retry가 무의미한 영구 오류. 호출 측에서 catch해 배치 abort."""


def fetch_pending_news(supabase: Client, limit: int) -> list[dict]:
    """news_classifications에 없는 news 미분류 건을 최신순 limit개 가져온다."""
    pool = max(limit * 5, 100)
    res_news = (
        supabase.table("news")
        .select("id, title, raw_content")
        .order("published_at", desc=True, nullsfirst=False)
        .limit(pool)
        .execute()
    )
    news_rows = res_news.data or []
    if not news_rows:
        return []

    ids = [r["id"] for r in news_rows]
    res_cls = (
        supabase.table("news_classifications")
        .select("news_id")
        .in_("news_id", ids)
        .execute()
    )
    classified_ids = {r["news_id"] for r in (res_cls.data or [])}

    pending = [r for r in news_rows if r["id"] not in classified_ids][:limit]
    return pending


def strip_html(text: str | None) -> str:
    if not text:
        return ""
    no_tag = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", no_tag).strip()


def parse_classification(text: str) -> dict | None:
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    sent = (obj.get("sentiment") or "").strip().lower()
    cat = (obj.get("event_category") or "").strip().lower()
    if sent not in SENTIMENTS or cat not in EVENT_CATEGORIES:
        return None
    conf = obj.get("confidence")
    try:
        conf_f = float(conf) if conf is not None else None
        if conf_f is not None:
            conf_f = max(0.0, min(1.0, conf_f))
    except (TypeError, ValueError):
        conf_f = None
    return {"sentiment": sent, "event_category": cat, "confidence": conf_f}


def _is_fatal(message: str) -> bool:
    low = message.lower().replace(" ", "")  # "PerDay" 매칭을 위해 공백 제거.
    return any(hint.replace(" ", "") in low for hint in FATAL_HINTS)


_RETRY_DELAY_RE = re.compile(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s", re.IGNORECASE)


def _extract_retry_delay(message: str) -> float | None:
    """Gemini 429 응답의 retryDelay 초 값을 추출. 없으면 None."""
    m = _RETRY_DELAY_RE.search(message)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def classify_one(client: genai.Client, model: str, title: str, summary: str) -> dict | None:
    """1건 분류. 일시 오류만 재시도. 영구 오류는 FatalApiError raise."""
    prompt = PROMPT_TEMPLATE.format(title=title[:300], summary=summary[:1000])
    # Gemini 2.5 Flash는 thinking 모델. 분류는 추론 없이도 충분하므로 thinking_budget=0으로
    # 비활성화 — 활성 시 max_output_tokens가 내부 추론에 소진돼 응답 텍스트가 비어 parse 실패.
    config = genai_types.GenerateContentConfig(
        response_mime_type="application/json",
        max_output_tokens=MAX_TOKENS,
        temperature=0.2,
        thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
    )
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            text = (resp.text or "").strip()
            parsed = parse_classification(text)
            if parsed is None:
                print(f"[classifier] parse failed for title={title[:40]!r}: raw={text[:200]!r}", flush=True)
                return None
            return parsed
        except genai_errors.ClientError as e:
            # 4xx 계열. key/permission/일별 quota는 fatal. 분당 quota(429)는 retryDelay 따라 대기.
            msg = str(e)
            if _is_fatal(msg):
                raise FatalApiError(msg) from e
            last_exc = e
            suggested = _extract_retry_delay(msg)
            wait = suggested + 1.0 if suggested is not None else BACKOFF_BASE_SECONDS ** attempt
            print(f"[classifier] client error ({msg[:200]}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
        except genai_errors.ServerError as e:
            # 5xx 또는 일시 rate limit. 재시도 가치 있음.
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[classifier] server error ({str(e)[:200]}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
        except Exception as e:
            # 알 수 없는 오류. 메시지 검사 후 fatal/transient 분기.
            msg = str(e)
            if _is_fatal(msg):
                raise FatalApiError(msg) from e
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[classifier] unexpected error ({type(e).__name__}: {msg[:200]}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[classifier] failed after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None


def upsert_classification(supabase: Client, news_id: int, result: dict, model_id: str) -> bool:
    row = {
        "news_id": news_id,
        "sentiment": result["sentiment"],
        "event_category": result["event_category"],
        "confidence": result["confidence"],
        "model_id": model_id,
        "classified_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        supabase.table("news_classifications").upsert(row, on_conflict="news_id").execute()
        return True
    except Exception as e:
        code = getattr(e, "code", None)
        message = getattr(e, "message", None) or str(e)
        print(f"[classifier] upsert error news_id={news_id}: code={code!r} message={message!r}", flush=True)
        return False


def run_once(
    supabase: Client,
    client: genai.Client,
    model: str,
    batch: int,
    call_sleep: float,
) -> tuple[int, int]:
    """(시도 건수, 적재 성공 건수) 반환."""
    pending = fetch_pending_news(supabase, batch)
    if not pending:
        print("[classifier] no pending news, exit batch", flush=True)
        return (0, 0)
    print(f"[classifier] pending={len(pending)}", flush=True)

    classified = 0
    for idx, row in enumerate(pending):
        if _shutdown:
            break
        title = row.get("title") or ""
        summary = strip_html(row.get("raw_content"))
        try:
            result = classify_one(client, model, title, summary)
        except FatalApiError as e:
            print(f"[classifier] FATAL abort batch: {e}", flush=True)
            break
        if result is None:
            continue
        ok = upsert_classification(supabase, row["id"], result, model)
        if ok:
            classified += 1
            print(
                f"[classifier] news_id={row['id']} sentiment={result['sentiment']} "
                f"category={result['event_category']} conf={result['confidence']}",
                flush=True,
            )
        # 다음 호출 전 sleep — Gemini Free tier RPM 보호. 마지막 항목 뒤엔 생략.
        if idx + 1 < len(pending):
            time.sleep(call_sleep)
    return (len(pending), classified)


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    google_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not url or not key:
        print("[classifier] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1
    if not google_key:
        print("[classifier] FATAL GOOGLE_API_KEY missing", flush=True)
        return 1

    model = os.getenv("CLASSIFY_MODEL", DEFAULT_MODEL)
    batch = int(os.getenv("CLASSIFY_BATCH_SIZE", str(DEFAULT_BATCH)))
    call_sleep = float(os.getenv("CLASSIFY_CALL_SLEEP_SECONDS", str(DEFAULT_CALL_SLEEP)))
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", "3600"))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)
    client = genai.Client(api_key=google_key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(
        f"[classifier] start model={model} batch={batch} call_sleep={call_sleep}s once={once}",
        flush=True,
    )

    while True:
        tried, ok = run_once(supabase, client, model, batch, call_sleep)
        print(f"[classifier] tick tried={tried} classified={ok}", flush=True)

        if once or _shutdown:
            break

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[classifier] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
