# 미분류 news를 Anthropic Claude Haiku 4.5로 sentiment + event_category 분류해 news_classifications에 적재한다.
# 가격 예측은 절대 수행하지 않음 — 감성·통계 표시 전용.
#
# 환경변수 (worker/.env 또는 GitHub Actions Secrets)
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — Supabase 클라이언트
#   ANTHROPIC_API_KEY                        — Claude API key
#   CLASSIFY_BATCH_SIZE                      — 1회 처리할 미분류 건수 (기본 25)
#   CLASSIFY_MODEL                           — 모델 ID (기본 claude-haiku-4-5-20251001)
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

import anthropic
from dotenv import load_dotenv
from supabase import Client, create_client

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_BATCH = 25
MAX_TOKENS = 200
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0

SENTIMENTS = {"positive", "neutral", "negative"}
EVENT_CATEGORIES = {"listing", "regulation", "hack", "partnership", "tech", "general"}

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
- event_category — 상장/추가 listing, 규제·소송·정책 regulation, 해킹·익스플로잇·해킹사건 hack, 파트너십·통합·투자유치 partnership, 기술·업그레이드·신제품 tech, 그 외 general.
- 매매 신호로 해석하지 않는다. 통계 표시 전용.
"""


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[classifier] received signal {signum}, will exit after current batch", flush=True)


def fetch_pending_news(supabase: Client, limit: int) -> list[dict]:
    """news_classifications에 없는 news 미분류 건을 최신순 limit개 가져온다.
    PostgREST는 LEFT JOIN NOT EXISTS를 직접 지원하지 않으니 클라이언트에서 차집합 처리."""
    # 1) 후보 news 최신순 (limit의 5배 정도로 여유 확보 — 이미 분류된 항목 제외하기 위해)
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
    """HTML 태그를 제거한 평문 반환. summary에 종종 HTML이 섞여 있어 토큰 절약 차원."""
    if not text:
        return ""
    no_tag = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", no_tag).strip()


def parse_classification(text: str) -> dict | None:
    """LLM 응답 텍스트에서 JSON 객체를 추출해 스키마 검증 후 dict 반환. 실패 시 None."""
    if not text:
        return None
    # 첫 '{' 와 마지막 '}' 사이 추출 — 모델이 가끔 설명을 덧붙여도 안전.
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


class FatalApiError(Exception):
    """credit 부족·인증 실패 등 재시도가 무의미한 영구 오류. 호출 측에서 잡아 전체 배치 abort."""


def classify_one(client: anthropic.Anthropic, model: str, title: str, summary: str) -> dict | None:
    """1건 분류. 일시적 오류만 재시도. 영구 오류(400 BadRequest, 401 Auth)는 FatalApiError raise."""
    prompt = PROMPT_TEMPLATE.format(title=title[:300], summary=summary[:1000])
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            msg = client.messages.create(
                model=model,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
            )
            text = ""
            for block in msg.content:
                if getattr(block, "type", None) == "text":
                    text += getattr(block, "text", "")
            parsed = parse_classification(text)
            if parsed is None:
                print(f"[classifier] parse failed for title={title[:40]!r}: raw={text[:200]!r}", flush=True)
                return None
            return parsed
        except (anthropic.BadRequestError, anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
            # credit 부족 / invalid key / 권한 — retry 무의미. 호출 측이 전체 abort 결정.
            raise FatalApiError(str(e)) from e
        except anthropic.RateLimitError as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[classifier] rate limit, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
        except anthropic.APIError as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[classifier] api error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
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


def run_once(supabase: Client, client: anthropic.Anthropic, model: str, batch: int) -> tuple[int, int]:
    """(시도 건수, 적재 성공 건수) 반환."""
    pending = fetch_pending_news(supabase, batch)
    if not pending:
        print("[classifier] no pending news, exit batch", flush=True)
        return (0, 0)
    print(f"[classifier] pending={len(pending)}", flush=True)

    classified = 0
    for row in pending:
        if _shutdown:
            break
        title = row.get("title") or ""
        summary = strip_html(row.get("raw_content"))
        try:
            result = classify_one(client, model, title, summary)
        except FatalApiError as e:
            # credit balance / invalid key — 더 시도해도 무의미. 배치 즉시 중단.
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
    return (len(pending), classified)


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    anth_key = os.getenv("ANTHROPIC_API_KEY")
    if not url or not key:
        print("[classifier] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1
    if not anth_key:
        print("[classifier] FATAL ANTHROPIC_API_KEY missing", flush=True)
        return 1

    model = os.getenv("CLASSIFY_MODEL", DEFAULT_MODEL)
    batch = int(os.getenv("CLASSIFY_BATCH_SIZE", str(DEFAULT_BATCH)))
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", "3600"))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)
    client = anthropic.Anthropic(api_key=anth_key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(f"[classifier] start model={model} batch={batch} once={once}", flush=True)

    while True:
        tried, ok = run_once(supabase, client, model, batch)
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
