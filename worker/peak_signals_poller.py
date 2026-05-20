# 강세장 정점 신호를 일 1회 계산해 peak_signals 테이블에 적재하는 워커.
# Stage 2.5. 1차 구현 — 키 불필요한 3개 지표만 (CMC API key 발급 후 확장).
#
# 지표
#   - btc_dominance         CoinGecko /global → market_cap_percentage.btc. threshold 70% (사이클 top 영역).
#   - mayer_multiple        BTC 현재 종가 / 200dMA. threshold 2.4 (역사적 top zone).
#   - pi_cycle_top          111dMA / (350dMA × 2). threshold 1.0 (cross 시점이 사이클 top).
#   - btc_rsi_22            BTC 일봉 22일 RSI. threshold 70 (과매수).
#   - ahr999                (price / 200d_geomean) × (price / regression_price). threshold 1.2.
#   - rainbow_band          BTC log 회귀 밴드 인덱스 0-7. threshold ≥6 (Bubble territory).
#   - two_year_ma_multiple  price / 2y SMA. threshold 5 (역사적 top zone). 730일 누적 필요.
#
# 데이터 부족 처리 — candles 누적이 부족하면 status='insufficient_data'로 기록.
# 행 자체는 적재해 추적 가능하게 한다.
#
# 환경변수
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#   POLL_ONCE=1                           — 1회만 실행 후 종료 (GitHub Actions)
#   POLL_INTERVAL_SECONDS                 — 무한 루프 시 (기본 86400 = 24h)
from __future__ import annotations

import math
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Callable

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

COINGECKO_GLOBAL_URL = "https://api.coingecko.com/api/v3/global"
HTTP_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0

# Bitcoin genesis block — AHR999/Rainbow 회귀 기준점.
BTC_GENESIS = datetime(2009, 1, 3, tzinfo=timezone.utc)

# BTC Dominance — ≥ 70%가 통상 사이클 후반 / BTC 우위 단계.
BTC_DOMINANCE_THRESHOLD = 70.0

# Mayer Multiple — historically ≥ 2.4 marks late-cycle territory.
MAYER_THRESHOLD = 2.4
MAYER_WINDOW = 200

# Pi Cycle Top — 111dMA crossing above 350dMA × 2 has marked every BTC cycle top.
PI_CYCLE_SHORT_WINDOW = 111
PI_CYCLE_LONG_WINDOW = 350
PI_CYCLE_THRESHOLD = 1.0

# RSI 22일 — 주봉 RSI에 가까운 일봉 변형. 70 이상 과매수.
RSI22_WINDOW = 22
RSI22_THRESHOLD = 70.0

# AHR999 — (price/200d_geomean) × (price/regression_price). 1.2 이상 매도 영역.
AHR999_WINDOW = 200
AHR999_THRESHOLD = 1.2

# Rainbow Chart — log 회귀 base + 8 band offset. band index 6 이상이면 Bubble territory.
# AHR999와 동일한 days-from-genesis 회귀식(log10(p) = 5.84 × log10(age) - 17.01)을 baseline으로 사용.
RAINBOW_BAND_THRESHOLD = 6
RAINBOW_LOG_COEF = 5.84
RAINBOW_LOG_INTERCEPT = -17.01
RAINBOW_BAND_MIN_OFFSET = -0.8  # baseline 기준 최저 band 시작점 (log10) — ×0.16
RAINBOW_BAND_WIDTH = 0.2  # 각 band의 log10 단위 폭 — band 7 끝 = baseline × ~25

# 2년 MA Multiple — price / 2y SMA. ≥ 5 역사적 top zone.
TWO_YEAR_WINDOW = 730
TWO_YEAR_THRESHOLD = 5.0

# bitcoin-data.com 무료 온체인 API (키 불필요). 응답 — { d, unixTs, <key>: float }.
BITCOIN_DATA_BASE = "https://bitcoin-data.com/api/v1"
# 분당 한도 친 경우 60초 가까이 대기 필요 — 기본 백오프(2/4/8s)보다 크게 4/16/64s.
BITCOIN_DATA_BACKOFF_BASE = 4.0
# 4개 endpoint 연속 호출 사이 짧은 sleep — 분당 호출 분산.
BITCOIN_DATA_CALL_SPACING = 0.5
# 임계값 — 역사적 정점 영역 (Glassnode/CoinMarketCap 등의 공개 자료 기준).
PUELL_THRESHOLD = 4.0     # 일일 발행량 × 가격 / 365d 평균. ≥ 4.0 사이클 top.
MVRV_Z_THRESHOLD = 7.0    # (mcap - realized cap) / std. ≥ 7.0 top zone.
NUPL_THRESHOLD = 0.75     # Net Unrealized Profit/Loss. ≥ 0.75 euphoria.
MVRV_THRESHOLD = 3.7      # mcap / realized cap. ≥ 3.7 top zone.

# CoinGecko company treasury endpoint — Strategy(구 MicroStrategy) BTC 보유 데이터.
COINGECKO_TREASURY_URL = "https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin"
# MSTR PnL 배수 임계값 — 역사적 사이클 top에서 BTC가 MSTR 평균 매입가의 ~2.4-2.5배.
MSTR_PNL_THRESHOLD = 2.0

# Farside 공개 BTC spot ETF flow 표 (US$m). Cloudflare가 차단하면 error 행으로 가시화한다.
FARSIDE_BTC_ETF_FLOW_URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/"
# ETF 순유출 streak — 5거래일 연속 순유출이면 위험 신호로 간주.
ETF_OUTFLOW_STREAK_THRESHOLD = 5.0
# Farside는 보유 BTC가 아니라 USD flow만 제공한다. 누적 순유입 / BTC 시총 proxy가 5% 이상이면 과열권으로 표시.
ETF_NET_FLOW_MCAP_RATIO_THRESHOLD = 5.0

# CoinMarketCap Pro API (Basic 무료 plan: 10k credits/월, 30 req/min).
# 호출 시 X-CMC_PRO_API_KEY 헤더 필수. CMC_API_KEY env 없으면 관련 지표 skip.
CMC_BASE = "https://pro-api.coinmarketcap.com"
# Altcoin Season Index — checklist 2.5-B0 핵심 지표. 0-100 스케일, ≥75 알트시즌.
# CMC 공식 docs 확인 완료 — Basic 무료 plan에서 사용 가능. 응답 키는 data.altcoin_index.
CMC_ALTCOIN_SEASON_PATH = "/v1/altcoin-season-index/latest"
CMC_ALTCOIN_SEASON_THRESHOLD = 75.0  # 정점 신호 — 알트시즌 진입 (BTC 사이클 후반)

# Altcoin Season Index 원조 사이트 (Blockchaincenter.net). 키 불필요, 정적 HTML에 값 박힘.
# Next.js SSR로 "Altcoin Season (<!-- -->N<!-- -->)" 형태로 렌더링.
BLOCKCHAINCENTER_ALTSEASON_URL = "https://www.blockchaincenter.net/altcoin-season-index/"
# 1순위 — Next.js hydration boundary 주석 포함 정확 매칭.
# 2순위 — 주석 변형 흡수 (Next.js 버전 업그레이드 대비). 둘 다 본문 "Top 50" 같은 false positive 회피.
_BLOCKCHAINCENTER_PATTERNS = (
    re.compile(r"Altcoin Season \(<!-- -->(\d{1,3})<!-- -->\)"),
    re.compile(r"\bAltcoin Season\s*\(\s*(?:<!--[^>]*-->)?\s*(\d{1,3})"),
)

_shutdown = False


class _TableTextParser(HTMLParser):
    """HTML table cell text collector. Farside 표처럼 단순 table인 경우만 사용."""

    def __init__(self) -> None:
        super().__init__()
        self.in_cell = False
        self.current: list[str] = []
        self.cells: list[str] = []

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag.lower() in ("td", "th"):
            self.in_cell = True
            self.current = []

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.current.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in ("td", "th") and self.in_cell:
            text = " ".join("".join(self.current).split())
            if text:
                self.cells.append(text)
            self.in_cell = False
            self.current = []


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[peak] received signal {signum}, will exit after current loop", flush=True)


# ─── 데이터 소스 ──────────────────────────────────────────

def fetch_global() -> dict | None:
    """CoinGecko /global 응답 dict. 실패 시 None."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(COINGECKO_GLOBAL_URL)
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[peak] 429 rate-limited, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json().get("data") or {}
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[peak] /global error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[peak] /global fetch failed after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None


def fetch_blockchaincenter_altseason() -> tuple[int | None, str | None]:
    """Blockchaincenter.net 정적 HTML에서 Altcoin Season Index 정수값 추출.
    성공 시 (value, None), 실패 시 (None, reason)."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
                resp = client.get(
                    BLOCKCHAINCENTER_ALTSEASON_URL,
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
                )
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[peak] blockchaincenter 429, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                html = resp.text
                for pat in _BLOCKCHAINCENTER_PATTERNS:
                    m = pat.search(html)
                    if m:
                        value = int(m.group(1))
                        if 0 <= value <= 100:
                            return value, None
                        return None, f"value out of range: {value}"
                return None, "pattern not found in 250kb html"
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[peak] blockchaincenter error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    return None, f"fetch failed after {MAX_RETRIES}: {last_exc!r}"


def fetch_cmc(path: str, params: dict | None = None) -> dict | None:
    """CMC Pro API GET. X-CMC_PRO_API_KEY 헤더 필수. 키 없으면 None.
    응답 envelope의 data 필드를 그대로 반환 (status 영역은 워커 로그로만)."""
    key = os.getenv("CMC_API_KEY", "").strip()
    if not key:
        return None
    url = f"{CMC_BASE}{path}"
    headers = {"X-CMC_PRO_API_KEY": key, "Accept": "application/json"}
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(url, headers=headers, params=params or {})
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[peak] cmc {path} 429, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                if resp.status_code in (401, 403):
                    print(f"[peak] cmc {path} auth error {resp.status_code} — check CMC_API_KEY", flush=True)
                    return None
                if resp.status_code == 404:
                    # endpoint 미존재(잘못된 경로 추정). 사용자 디버깅용 명시.
                    print(f"[peak] cmc {path} 404 — endpoint may not exist on Basic tier", flush=True)
                    return None
                resp.raise_for_status()
                body = resp.json()
            status = body.get("status") or {}
            code = status.get("error_code")
            if code and code != 0:
                print(f"[peak] cmc {path} api error code={code} msg={status.get('error_message')!r}", flush=True)
                return None
            return body.get("data")
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[peak] cmc {path} error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[peak] cmc {path} fetch failed after {MAX_RETRIES}: {last_exc!r}", flush=True)
    return None


def fetch_treasury() -> dict | None:
    """CoinGecko /companies/public_treasury/bitcoin — Strategy 등 상장사 BTC 보유 응답."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(COINGECKO_TREASURY_URL)
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[peak] treasury 429, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[peak] treasury error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[peak] treasury fetch failed after {MAX_RETRIES}: {last_exc!r}", flush=True)
    return None


def fetch_farside_etf_flows() -> list[dict] | None:
    """Farside BTC ETF flow 표를 파싱해 [{date, total_usdm}] 반환.
    Farside 값 단위는 US$m. 음수는 괄호 표기 "(95.1)"도 지원한다.
    """
    last_exc: Exception | None = None
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True, headers=headers) as client:
                resp = client.get(FARSIDE_BTC_ETF_FLOW_URL)
                if resp.status_code == 429:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    print(f"[peak] farside 429, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                html = resp.text
            if "Just a moment" in html and "Cloudflare" in html:
                print("[peak] farside blocked by Cloudflare challenge", flush=True)
                return None
            rows = parse_farside_etf_flows(html)
            if rows:
                return rows
            print("[peak] farside parse returned no rows", flush=True)
            return None
        except (httpx.HTTPError, ValueError) as e:
            last_exc = e
            wait = BACKOFF_BASE_SECONDS ** attempt
            print(f"[peak] farside error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[peak] farside fetch failed after {MAX_RETRIES}: {last_exc!r}", flush=True)
    return None


def parse_farside_etf_flows(html: str) -> list[dict]:
    parser = _TableTextParser()
    parser.feed(html)
    cells = parser.cells
    if not cells:
        # 검색/캐시된 plain text처럼 HTML cell tag가 제거된 경우를 위한 약한 fallback.
        cells = [line.strip() for line in html.splitlines() if line.strip()]
    try:
        date_idx = cells.index("Date")
        total_idx = cells.index("Total", date_idx)
    except ValueError:
        return []
    columns = cells[date_idx:total_idx + 1]
    width = len(columns)
    if width < 2:
        return []
    rows: list[dict] = []
    i = total_idx + 1
    while i + width <= len(cells):
        chunk = cells[i:i + width]
        parsed_date = _parse_farside_date(chunk[0])
        if not parsed_date:
            i += 1
            continue
        total = _parse_flow_usdm(chunk[-1])
        if total is not None:
            rows.append({"date": parsed_date, "total_usdm": total})
        i += width
    rows.sort(key=lambda r: r["date"])
    return rows


def _parse_farside_date(raw: str) -> str | None:
    raw = " ".join(raw.split())
    for fmt in ("%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def _parse_flow_usdm(raw: str) -> float | None:
    text = raw.strip().replace(",", "")
    if text in ("", "-", "—"):
        return 0.0
    neg = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    text = re.sub(r"[^0-9.\-]", "", text)
    if text in ("", "-", "."):
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return -value if neg else value


def _find_strategy(companies: list[dict]) -> dict | None:
    """Strategy(구 MicroStrategy) 항목 검색. rebrand 전후 이름 모두 대응."""
    for c in companies or []:
        name = (c.get("name") or "").lower()
        if name in ("strategy", "microstrategy"):
            return c
    return None


def fetch_bitcoin_data(endpoint: str, value_key: str) -> tuple[float | None, str | None]:
    """bitcoin-data.com /api/v1/{endpoint}/last 응답에서 (value, data_date_iso) 추출.
    실패 시 (None, None). 응답 형식 — {"d":"YYYY-MM-DD","unixTs":...,"<value_key>":float}.
    분당 한도(429)는 60초 가까이 대기 필요해 백오프를 4/16/64s로 크게.
    """
    url = f"{BITCOIN_DATA_BASE}/{endpoint}/last"
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = client.get(url)
                if resp.status_code == 429:
                    # 분당 한도는 60초 후 확실히 풀린다. 첫 retry는 60초 고정,
                    # 후속은 큰 백오프(분/시 한도 동시 충돌 대비).
                    wait = 60.0 if attempt == 1 else BITCOIN_DATA_BACKOFF_BASE ** attempt
                    print(f"[peak] {endpoint} 429, retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
                    time.sleep(wait)
                    continue
                # Retry-After 헤더가 있으면 우선 (일부 게이트웨이가 보냄)
                resp.raise_for_status()
                body = resp.json()
            raw = body.get(value_key)
            d = body.get("d")
            if raw is None or d is None:
                print(f"[peak] {endpoint} missing key (value_key={value_key} d={d!r}): {body!r}", flush=True)
                return None, None
            return float(raw), f"{d}T00:00:00+00:00"
        except (httpx.HTTPError, ValueError, TypeError) as e:
            last_exc = e
            wait = BITCOIN_DATA_BACKOFF_BASE ** attempt
            print(f"[peak] {endpoint} error ({e!r}), retry {attempt}/{MAX_RETRIES} in {wait:.0f}s", flush=True)
            time.sleep(wait)
    print(f"[peak] {endpoint} fetch failed after {MAX_RETRIES} retries: {last_exc!r}", flush=True)
    return None, None


def fetch_btc_closes(supabase: Client, limit: int = 400) -> list[tuple[str, float]]:
    """BTC 1d 종가를 open_time 오름차순으로 반환. (open_time_iso, close) tuples."""
    res = (
        supabase.table("candles")
        .select("open_time, close")
        .eq("symbol", "BTC")
        .eq("timeframe", "1d")
        .order("open_time", desc=True)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    out: list[tuple[str, float]] = []
    for r in rows:
        ot = r.get("open_time")
        cl = r.get("close")
        if ot is None or cl is None:
            continue
        try:
            out.append((str(ot), float(cl)))
        except (TypeError, ValueError):
            continue
    # 오름차순으로 정렬해 SMA 계산 단순화
    out.sort(key=lambda x: x[0])
    return out


# ─── 계산 ─────────────────────────────────────────────────

def sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def compute_btc_dominance(
    global_data: dict | None,
    captured_at: str,
) -> dict:
    """BTC 점유율(%). threshold 70 — 사이클 후반 BTC 우위 영역."""
    if not global_data:
        return _row(
            "btc_dominance", None, BTC_DOMINANCE_THRESHOLD, None, None,
            source="coingecko", status="error", note="global fetch failed", captured_at=captured_at,
        )
    mc_pct = (global_data.get("market_cap_percentage") or {}).get("btc")
    try:
        value = float(mc_pct) if mc_pct is not None else None
    except (TypeError, ValueError):
        value = None
    if value is None:
        return _row(
            "btc_dominance", None, BTC_DOMINANCE_THRESHOLD, None, None,
            source="coingecko", status="error",
            note="market_cap_percentage.btc missing", captured_at=captured_at,
        )
    hit = value >= BTC_DOMINANCE_THRESHOLD
    progress = min(100.0, max(0.0, (value / BTC_DOMINANCE_THRESHOLD) * 100))
    return _row(
        "btc_dominance",
        value=round(value, 4),
        threshold=BTC_DOMINANCE_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="coingecko",
        status="ok",
        note=None,
        captured_at=captured_at,
    )


def compute_btc_rsi_22(closes: list[float], captured_at: str) -> dict:
    """BTC 일봉 22일 RSI. threshold 70 (과매수 영역)."""
    if len(closes) < RSI22_WINDOW + 1:
        return _row(
            "btc_rsi_22", None, RSI22_THRESHOLD, None, None,
            source="computed", status="insufficient_data",
            note=f"need {RSI22_WINDOW + 1} closes, have {len(closes)}",
            captured_at=captured_at,
        )
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    recent = deltas[-RSI22_WINDOW:]
    gains = sum(d for d in recent if d > 0)
    losses = sum(-d for d in recent if d < 0)
    if losses == 0:
        rsi = 100.0
    else:
        rs = (gains / RSI22_WINDOW) / (losses / RSI22_WINDOW)
        rsi = 100.0 - (100.0 / (1.0 + rs))
    hit = rsi >= RSI22_THRESHOLD
    progress = min(100.0, max(0.0, (rsi / RSI22_THRESHOLD) * 100))
    return _row(
        "btc_rsi_22",
        value=round(rsi, 4),
        threshold=RSI22_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="computed",
        status="ok",
        note=None,
        captured_at=captured_at,
    )


def compute_ahr999(closes: list[float], captured_at: str) -> dict:
    """AHR999 = (price/200d_geomean) × (price/regression_price). threshold 1.2 (매도 영역)."""
    if len(closes) < AHR999_WINDOW:
        return _row(
            "ahr999", None, AHR999_THRESHOLD, None, None,
            source="computed", status="insufficient_data",
            note=f"need {AHR999_WINDOW} closes, have {len(closes)}",
            captured_at=captured_at,
        )
    # 200일 기하평균 = exp(mean(log(close)))
    window = closes[-AHR999_WINDOW:]
    if any(c <= 0 for c in window):
        return _row(
            "ahr999", None, AHR999_THRESHOLD, None, None,
            source="computed", status="error",
            note="non-positive close in window", captured_at=captured_at,
        )
    log_mean = sum(math.log(c) for c in window) / AHR999_WINDOW
    geomean = math.exp(log_mean)

    # BTC age (days since genesis). captured_at은 ISO 8601 + tz.
    now = datetime.fromisoformat(captured_at)
    age_days = max(1, (now - BTC_GENESIS).days)
    # 통상 AHR999 회귀식 — log10(predicted) = 5.84 × log10(age_days) - 17.01
    log_pred = 5.84 * math.log10(age_days) - 17.01
    pred_price = 10 ** log_pred

    price = closes[-1]
    if pred_price <= 0:
        return _row(
            "ahr999", None, AHR999_THRESHOLD, None, None,
            source="computed", status="error", note=f"pred_price={pred_price}",
            captured_at=captured_at,
        )
    ahr = (price / geomean) * (price / pred_price)
    hit = ahr >= AHR999_THRESHOLD
    progress = min(100.0, max(0.0, (ahr / AHR999_THRESHOLD) * 100))
    return _row(
        "ahr999",
        value=round(ahr, 6),
        threshold=AHR999_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="computed",
        status="ok",
        note=f"price={price:.2f} geomean200={geomean:.2f} pred={pred_price:.2f} age={age_days}d",
        captured_at=captured_at,
    )


def compute_rainbow_band(closes: list[float], captured_at: str) -> dict:
    """BTC log 회귀 밴드 인덱스 (0-7). threshold 6 (Bubble territory)."""
    if not closes:
        return _row(
            "rainbow_band", None, RAINBOW_BAND_THRESHOLD, None, None,
            source="computed", status="insufficient_data",
            note="no closes available", captured_at=captured_at,
        )
    now = datetime.fromisoformat(captured_at)
    age_days = max(1, (now - BTC_GENESIS).days)
    # Bitcoin Magazine 일반화 회귀: log10(price) = 2.66 × log10(days) - 17.92
    log_baseline = RAINBOW_LOG_COEF * math.log10(age_days) + RAINBOW_LOG_INTERCEPT
    baseline = 10 ** log_baseline

    price = closes[-1]
    if price <= 0:
        return _row(
            "rainbow_band", None, RAINBOW_BAND_THRESHOLD, None, None,
            source="computed", status="error", note=f"price={price}",
            captured_at=captured_at,
        )
    log_price = math.log10(price)
    # baseline 기준 ±0.8 log 단위(약 ÷0.16 ~ ×6.3 범위)를 8개 밴드로 분할.
    band_min_log = log_baseline + RAINBOW_BAND_MIN_OFFSET
    raw_idx = (log_price - band_min_log) / RAINBOW_BAND_WIDTH
    band_idx = max(0, min(7, int(raw_idx)))
    hit = band_idx >= RAINBOW_BAND_THRESHOLD
    progress = min(100.0, max(0.0, (band_idx / RAINBOW_BAND_THRESHOLD) * 100))
    return _row(
        "rainbow_band",
        value=float(band_idx),
        threshold=float(RAINBOW_BAND_THRESHOLD),
        hit=hit,
        progress_pct=round(progress, 2),
        source="computed",
        status="ok",
        note=f"price={price:.2f} baseline={baseline:.2f} age={age_days}d raw_idx={raw_idx:.2f}",
        captured_at=captured_at,
    )


def compute_mstr_btc_holdings(treasury: dict | None, captured_at: str) -> dict:
    """Strategy(구 MicroStrategy)의 BTC 보유 수량. 정보성 — threshold 없음."""
    if not treasury:
        return _row(
            "mstr_btc_holdings", None, None, None, None,
            source="coingecko", status="error", note="treasury fetch failed",
            captured_at=captured_at,
        )
    company = _find_strategy(treasury.get("companies") or [])
    if not company:
        return _row(
            "mstr_btc_holdings", None, None, None, None,
            source="coingecko", status="error",
            note="Strategy/MicroStrategy not found in companies list",
            captured_at=captured_at,
        )
    holdings = company.get("total_holdings")
    if holdings is None:
        return _row(
            "mstr_btc_holdings", None, None, None, None,
            source="coingecko", status="error", note="total_holdings missing",
            captured_at=captured_at,
        )
    pct = company.get("percentage_of_total_supply")
    return _row(
        "mstr_btc_holdings",
        value=round(float(holdings), 2),
        threshold=None,
        hit=None,
        progress_pct=None,
        source="coingecko",
        status="ok",
        note=f"pct_of_supply={pct}",
        captured_at=captured_at,
    )


def compute_mstr_pnl_ratio(treasury: dict | None, captured_at: str) -> dict:
    """Strategy의 BTC 현재 평가 / 평균 매입 비용. threshold 2.0 (역사적 top zone)."""
    if not treasury:
        return _row(
            "mstr_pnl_ratio", None, MSTR_PNL_THRESHOLD, None, None,
            source="coingecko", status="error", note="treasury fetch failed",
            captured_at=captured_at,
        )
    company = _find_strategy(treasury.get("companies") or [])
    if not company:
        return _row(
            "mstr_pnl_ratio", None, MSTR_PNL_THRESHOLD, None, None,
            source="coingecko", status="error",
            note="Strategy/MicroStrategy not found",
            captured_at=captured_at,
        )
    entry = company.get("total_entry_value_usd")
    current = company.get("total_current_value_usd")
    holdings = company.get("total_holdings")
    if not entry or entry <= 0 or current is None:
        return _row(
            "mstr_pnl_ratio", None, MSTR_PNL_THRESHOLD, None, None,
            source="coingecko", status="error",
            note=f"entry={entry} current={current}",
            captured_at=captured_at,
        )
    ratio = float(current) / float(entry)
    hit = ratio >= MSTR_PNL_THRESHOLD
    progress = min(100.0, max(0.0, (ratio / MSTR_PNL_THRESHOLD) * 100))
    avg_cost = float(entry) / float(holdings) if holdings else None
    parts = [f"holdings={float(holdings):.0f}", f"entry=${float(entry):.0f}", f"current=${float(current):.0f}"]
    if avg_cost:
        parts.append(f"avg_cost=${avg_cost:.0f}")
    return _row(
        "mstr_pnl_ratio",
        value=round(ratio, 6),
        threshold=MSTR_PNL_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="coingecko",
        status="ok",
        note=" ".join(parts),
        captured_at=captured_at,
    )


def compute_etf_outflow_streak(etf_flows: list[dict] | None, captured_at: str) -> dict:
    """BTC spot ETF 총 flow가 며칠 연속 순유출인지 계산. threshold 5 거래일."""
    if not etf_flows:
        return _row(
            "etf_outflow_streak", None, ETF_OUTFLOW_STREAK_THRESHOLD, None, None,
            source="farside", status="error",
            note="Farside ETF flow fetch/parse failed",
            captured_at=captured_at,
        )
    streak = 0
    for row in sorted(etf_flows, key=lambda r: r["date"], reverse=True):
        if float(row["total_usdm"]) < 0:
            streak += 1
        else:
            break
    latest = max(etf_flows, key=lambda r: r["date"])
    hit = streak >= ETF_OUTFLOW_STREAK_THRESHOLD
    progress = min(100.0, max(0.0, (streak / ETF_OUTFLOW_STREAK_THRESHOLD) * 100))
    return _row(
        "etf_outflow_streak",
        value=float(streak),
        threshold=ETF_OUTFLOW_STREAK_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="farside",
        status="ok",
        note=f"latest={latest['date']} total=${float(latest['total_usdm']):.1f}m rows={len(etf_flows)}",
        captured_at=captured_at,
    )


def compute_etf_net_flow_btc_mcap_ratio(
    etf_flows: list[dict] | None,
    global_data: dict | None,
    captured_at: str,
) -> dict:
    """Farside 누적 BTC ETF 순유입(USD) / CoinGecko BTC 시총(%).
    Farside는 ETF 보유 BTC 수량을 제공하지 않으므로, 보유량 비율이 아닌 flow/mcap proxy다.
    """
    if not etf_flows:
        return _row(
            "etf_net_flow_btc_mcap_pct", None, ETF_NET_FLOW_MCAP_RATIO_THRESHOLD, None, None,
            source="farside+coingecko", status="error",
            note="Farside ETF flow fetch/parse failed",
            captured_at=captured_at,
        )
    if not global_data:
        return _row(
            "etf_net_flow_btc_mcap_pct", None, ETF_NET_FLOW_MCAP_RATIO_THRESHOLD, None, None,
            source="farside+coingecko", status="error",
            note="CoinGecko global fetch failed",
            captured_at=captured_at,
        )
    total_market_cap = (global_data.get("total_market_cap") or {}).get("usd")
    btc_pct = (global_data.get("market_cap_percentage") or {}).get("btc")
    try:
        btc_mcap = float(total_market_cap) * (float(btc_pct) / 100.0)
    except (TypeError, ValueError):
        btc_mcap = 0.0
    if btc_mcap <= 0:
        return _row(
            "etf_net_flow_btc_mcap_pct", None, ETF_NET_FLOW_MCAP_RATIO_THRESHOLD, None, None,
            source="farside+coingecko", status="error",
            note=f"invalid btc_mcap total_market_cap={total_market_cap} btc_pct={btc_pct}",
            captured_at=captured_at,
        )
    cumulative_usd = sum(float(r["total_usdm"]) for r in etf_flows) * 1_000_000.0
    pct = (cumulative_usd / btc_mcap) * 100.0
    hit = pct >= ETF_NET_FLOW_MCAP_RATIO_THRESHOLD
    progress = min(100.0, max(0.0, (pct / ETF_NET_FLOW_MCAP_RATIO_THRESHOLD) * 100))
    latest = max(etf_flows, key=lambda r: r["date"])
    return _row(
        "etf_net_flow_btc_mcap_pct",
        value=round(pct, 4),
        threshold=ETF_NET_FLOW_MCAP_RATIO_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="farside+coingecko",
        status="ok",
        note=f"cum_flow=${cumulative_usd/1_000_000_000:.2f}b btc_mcap=${btc_mcap/1_000_000_000:.2f}b latest={latest['date']}",
        captured_at=captured_at,
    )


def compute_altcoin_season_index(captured_at: str) -> dict:
    """Altcoin Season Index — 0-100 스케일, ≥75는 알트시즌(사이클 후반).
    1순위 원조 Blockchaincenter.net 정적 HTML 스크래핑 (키 불필요).
    2순위 CMC Pro API (CMC_API_KEY 있을 때만).
    둘 다 실패 시 status=error."""
    value, reason = fetch_blockchaincenter_altseason()
    source = "blockchaincenter"

    if value is None and os.getenv("CMC_API_KEY", "").strip():
        data = fetch_cmc(CMC_ALTCOIN_SEASON_PATH)
        if isinstance(data, dict):
            raw = (data.get("altcoin_index") or data.get("value")
                   or data.get("altcoin_season_index") or data.get("index"))
            try:
                value = float(raw) if raw is not None else None
            except (TypeError, ValueError):
                value = None
            source = "cmc"
            if value is None:
                keys = list(data.keys())[:10]
                reason = f"cmc response keys: {keys}"

    if value is None:
        return _row(
            "altcoin_season_index", None, CMC_ALTCOIN_SEASON_THRESHOLD, None, None,
            source=source, status="error",
            note=reason or "all sources failed",
            captured_at=captured_at,
        )

    value = float(value)
    hit = value >= CMC_ALTCOIN_SEASON_THRESHOLD
    progress = min(100.0, max(0.0, (value / CMC_ALTCOIN_SEASON_THRESHOLD) * 100))
    return _row(
        "altcoin_season_index",
        value=round(value, 2),
        threshold=CMC_ALTCOIN_SEASON_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source=source,
        status="ok",
        note=None,
        captured_at=captured_at,
    )


def compute_onchain_indicator(
    signal_key: str,
    endpoint: str,
    value_key: str,
    threshold: float,
    captured_at: str,
) -> dict:
    """bitcoin-data.com에서 단일 온체인 지표를 가져와 hit/progress 계산.
    공통 구조라 4개 함수를 하나로 합쳤다 (Puell / MVRV-Z / NUPL / MVRV).
    호출 사이 짧은 sleep으로 분당 한도 분산."""
    time.sleep(BITCOIN_DATA_CALL_SPACING)
    value, data_date = fetch_bitcoin_data(endpoint, value_key)
    if value is None:
        return _row(
            signal_key, None, threshold, None, None,
            source="bitcoin-data", status="error", note=f"{endpoint} fetch failed",
            captured_at=captured_at,
        )
    hit = value >= threshold
    progress = min(100.0, max(0.0, (value / threshold) * 100))
    return _row(
        signal_key,
        value=round(value, 6),
        threshold=threshold,
        hit=hit,
        progress_pct=round(progress, 2),
        source="bitcoin-data",
        status="ok",
        note=f"data_date={data_date[:10] if data_date else 'n/a'}",
        captured_at=captured_at,
    )


def compute_two_year_ma_multiple(closes: list[float], captured_at: str) -> dict:
    """price / 2y SMA. threshold 5 (역사적 top zone). 730일 누적 필요."""
    if len(closes) < TWO_YEAR_WINDOW:
        return _row(
            "two_year_ma_multiple", None, TWO_YEAR_THRESHOLD, None, None,
            source="computed", status="insufficient_data",
            note=f"need {TWO_YEAR_WINDOW} closes, have {len(closes)}",
            captured_at=captured_at,
        )
    sma_2y = sma(closes, TWO_YEAR_WINDOW)
    price = closes[-1]
    if not sma_2y or sma_2y <= 0:
        return _row(
            "two_year_ma_multiple", None, TWO_YEAR_THRESHOLD, None, None,
            source="computed", status="error", note="sma_2y invalid",
            captured_at=captured_at,
        )
    multiple = price / sma_2y
    hit = multiple >= TWO_YEAR_THRESHOLD
    progress = min(100.0, max(0.0, (multiple / TWO_YEAR_THRESHOLD) * 100))
    return _row(
        "two_year_ma_multiple",
        value=round(multiple, 6),
        threshold=TWO_YEAR_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="computed",
        status="ok",
        note=f"price={price:.2f} sma_2y={sma_2y:.2f}",
        captured_at=captured_at,
    )


def compute_mayer_multiple(closes: list[float], captured_at: str) -> dict:
    """현재 종가 / 200dMA. threshold 2.4 (역사적 top zone)."""
    if len(closes) < MAYER_WINDOW:
        return _row(
            "mayer_multiple", None, MAYER_THRESHOLD, None, None,
            source="computed", status="insufficient_data",
            note=f"need {MAYER_WINDOW} closes, have {len(closes)}",
            captured_at=captured_at,
        )
    sma200 = sma(closes, MAYER_WINDOW)
    now = closes[-1]
    if not sma200 or sma200 <= 0:
        return _row(
            "mayer_multiple", None, MAYER_THRESHOLD, None, None,
            source="computed", status="error", note="sma200 invalid", captured_at=captured_at,
        )
    value = now / sma200
    hit = value >= MAYER_THRESHOLD
    progress = min(100.0, max(0.0, (value / MAYER_THRESHOLD) * 100))
    return _row(
        "mayer_multiple",
        value=round(value, 6),
        threshold=MAYER_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="computed",
        status="ok",
        note=f"now={now:.2f} sma200={sma200:.2f}",
        captured_at=captured_at,
    )


def compute_pi_cycle_top(closes: list[float], captured_at: str) -> dict:
    """111dMA / (350dMA × 2). threshold 1.0 (cross 시점이 사이클 top)."""
    if len(closes) < PI_CYCLE_LONG_WINDOW:
        return _row(
            "pi_cycle_top", None, PI_CYCLE_THRESHOLD, None, None,
            source="computed", status="insufficient_data",
            note=f"need {PI_CYCLE_LONG_WINDOW} closes, have {len(closes)}",
            captured_at=captured_at,
        )
    sma111 = sma(closes, PI_CYCLE_SHORT_WINDOW)
    sma350 = sma(closes, PI_CYCLE_LONG_WINDOW)
    if not sma111 or not sma350 or sma350 <= 0:
        return _row(
            "pi_cycle_top", None, PI_CYCLE_THRESHOLD, None, None,
            source="computed", status="error",
            note=f"sma111={sma111} sma350={sma350}",
            captured_at=captured_at,
        )
    denom = sma350 * 2
    ratio = sma111 / denom
    hit = ratio >= PI_CYCLE_THRESHOLD
    progress = min(100.0, max(0.0, ratio * 100))
    return _row(
        "pi_cycle_top",
        value=round(ratio, 6),
        threshold=PI_CYCLE_THRESHOLD,
        hit=hit,
        progress_pct=round(progress, 2),
        source="computed",
        status="ok",
        note=f"sma111={sma111:.2f} sma350={sma350:.2f}",
        captured_at=captured_at,
    )


def _row(
    signal_key: str,
    value: float | None,
    threshold: float | None,
    hit: bool | None,
    progress_pct: float | None,
    *,
    source: str,
    status: str,
    note: str | None,
    captured_at: str,
) -> dict:
    return {
        "signal_key": signal_key,
        "value": value,
        "threshold": threshold,
        "hit": hit,
        "progress_pct": progress_pct,
        "source": source,
        "status": status,
        "note": note,
        "captured_at": captured_at,
    }


# ─── 메인 루프 ────────────────────────────────────────────

def upsert_signal(supabase: Client, row: dict) -> bool:
    """(signal_key, captured_at) 기준 upsert. 동일 일자 재실행은 덮어쓴다.
    단 status='error'는 같은 captured_at에 'ok' 행이 이미 있으면 적재하지 않는다
    (transient rate-limit이 기존 성공 값을 덮어쓰는 사고 방지)."""
    if row["status"] == "error":
        try:
            existing = (
                supabase.table("peak_signals")
                .select("status")
                .eq("signal_key", row["signal_key"])
                .eq("captured_at", row["captured_at"])
                .limit(1)
                .execute()
            )
            rows = existing.data or []
            if rows and rows[0].get("status") == "ok":
                print(
                    f"[peak] skip error overwrite of ok row: {row['signal_key']} "
                    f"({row.get('note')})",
                    flush=True,
                )
                return True
        except Exception as e:
            # 가드 조회 자체가 실패해도 본 upsert는 진행 (운영 가시성 우선)
            print(f"[peak] guard query failed for {row['signal_key']}: {e!r}", flush=True)
    try:
        supabase.table("peak_signals").upsert(
            row, on_conflict="signal_key,captured_at"
        ).execute()
        return True
    except Exception as e:
        print(f"[peak] upsert {row['signal_key']} error: {e!r}", flush=True)
        return False


def run_once(supabase: Client) -> int:
    """1회 사이클 — captured_at = 오늘 00:00 UTC. 각 지표를 계산해 upsert."""
    captured_at = (
        datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    )

    # 데이터 소스 한 번만 페치
    global_data = fetch_global()
    closes_with_time = fetch_btc_closes(supabase, limit=400)
    closes = [c for _, c in closes_with_time]
    treasury = fetch_treasury()
    etf_flows = fetch_farside_etf_flows()
    print(
        f"[peak] sources global={'ok' if global_data else 'fail'} "
        f"btc_closes={len(closes)} treasury={'ok' if treasury else 'fail'} "
        f"etf_flows={len(etf_flows) if etf_flows else 'fail'}",
        flush=True,
    )

    # 지표별 계산. 실패는 행 자체에 status='error'로 적재.
    computations: list[Callable[[], dict]] = [
        lambda: compute_btc_dominance(global_data, captured_at),
        lambda: compute_mayer_multiple(closes, captured_at),
        lambda: compute_pi_cycle_top(closes, captured_at),
        lambda: compute_btc_rsi_22(closes, captured_at),
        lambda: compute_ahr999(closes, captured_at),
        lambda: compute_rainbow_band(closes, captured_at),
        lambda: compute_two_year_ma_multiple(closes, captured_at),
        # 2.5-D 무료 온체인 (bitcoin-data.com, 키 불필요)
        lambda: compute_onchain_indicator(
            "puell_multiple", "puell-multiple", "puellMultiple", PUELL_THRESHOLD, captured_at,
        ),
        lambda: compute_onchain_indicator(
            "mvrv_z_score", "mvrv-zscore", "mvrvZscore", MVRV_Z_THRESHOLD, captured_at,
        ),
        lambda: compute_onchain_indicator(
            "nupl", "nupl", "nupl", NUPL_THRESHOLD, captured_at,
        ),
        lambda: compute_onchain_indicator(
            "mvrv_ratio", "mvrv", "mvrv", MVRV_THRESHOLD, captured_at,
        ),
        # 2.5-C 합법 무료 — Strategy(구 MicroStrategy) BTC 보유 (CoinGecko)
        lambda: compute_etf_outflow_streak(etf_flows, captured_at),
        lambda: compute_etf_net_flow_btc_mcap_ratio(etf_flows, global_data, captured_at),
        lambda: compute_mstr_btc_holdings(treasury, captured_at),
        lambda: compute_mstr_pnl_ratio(treasury, captured_at),
        # 2.5-B0 CMC 공식 API — Altcoin Season Index (CMC_API_KEY 발급 시 활성화)
        lambda: compute_altcoin_season_index(captured_at),
    ]
    inserted = 0
    for fn in computations:
        try:
            row = fn()
        except Exception as e:
            print(f"[peak] compute exception: {e!r}", flush=True)
            continue
        if upsert_signal(supabase, row):
            inserted += 1
            value_str = f"{row['value']:.4f}" if row["value"] is not None else "—"
            print(
                f"[peak] upserted {row['signal_key']:20} status={row['status']:18} "
                f"value={value_str:>10} hit={row['hit']} progress={row['progress_pct']}",
                flush=True,
            )
    return inserted


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[peak] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(24 * 3600)))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(f"[peak] start interval={interval}s once={once}", flush=True)

    while True:
        run_once(supabase)
        if once or _shutdown:
            break
        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[peak] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
