# candles 테이블에서 일봉 close를 읽어 RSI(14)·MACD(12/26/9)를 계산하고 indicators에 UPSERT한다.
# Stage 2-D. timeframe='1d' 고정.
#
# 환경변수
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#   POLL_SYMBOLS         — "BTC,ETH,SOL" 형식. 매핑은 candle_poller와 동일.
#   POLL_ONCE            — "1"이면 1회만 실행 후 종료.
#   POLL_INTERVAL_SECONDS — 무한 루프 시 간격 (기본 86400).
#   CANDLE_LOOKBACK      — 한 번에 로드할 캔들 수 (기본 200, MACD 26+9 + 여유분).
#
# 실행
#   POLL_ONCE=1 python indicators.py
from __future__ import annotations

import math
import os
import signal
import sys
import time
from datetime import datetime, timezone

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

TIMEFRAME = "1d"
RSI_PERIOD = 14
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9


_shutdown = False


def _request_shutdown(signum: int, _frame) -> None:
    global _shutdown
    _shutdown = True
    print(f"[indicators] received signal {signum}, will exit after current loop", flush=True)


def load_closes(supabase: Client, symbol: str, lookback: int) -> pd.DataFrame:
    """candles에서 (symbol, '1d') 최신 lookback개를 시간 오름차순으로 반환.
    DataFrame columns — open_time(str iso), close(float)."""
    resp = (
        supabase.table("candles")
        .select("open_time, close")
        .eq("symbol", symbol)
        .eq("timeframe", TIMEFRAME)
        .order("open_time", desc=True)
        .limit(lookback)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return pd.DataFrame(columns=["open_time", "close"])
    df = pd.DataFrame(rows).iloc[::-1].reset_index(drop=True)  # 시간 오름차순
    df["close"] = df["close"].astype(float)
    return df


def compute(df: pd.DataFrame) -> pd.DataFrame:
    """close 시계열에 대해 RSI 14·MACD(12,26,9)를 계산해 같은 길이의 DataFrame 반환."""
    out = df.copy()
    closes = out["close"]

    # RSI 14 — Wilder smoothing 대신 단순 rolling mean 변형(많은 라이브러리 디폴트와 동일).
    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0).rolling(RSI_PERIOD).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(RSI_PERIOD).mean()
    rs = gain / loss
    out["rsi_14"] = 100 - (100 / (1 + rs))

    # MACD 12/26/9 — adjust=False가 표준 EMA.
    ema_fast = closes.ewm(span=MACD_FAST, adjust=False).mean()
    ema_slow = closes.ewm(span=MACD_SLOW, adjust=False).mean()
    out["macd"] = ema_fast - ema_slow
    out["macd_signal"] = out["macd"].ewm(span=MACD_SIGNAL, adjust=False).mean()
    out["macd_hist"] = out["macd"] - out["macd_signal"]
    return out


def _nan_to_none(v):
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except TypeError:
        pass
    return v


def upsert_indicators(supabase: Client, symbol: str, df: pd.DataFrame) -> int:
    if df.empty:
        return 0
    payload: list[dict] = []
    for _, r in df.iterrows():
        payload.append({
            "symbol": symbol,
            "timeframe": TIMEFRAME,
            "open_time": r["open_time"],
            "rsi_14":      _nan_to_none(float(r["rsi_14"])      if pd.notna(r["rsi_14"])      else None),
            "macd":        _nan_to_none(float(r["macd"])        if pd.notna(r["macd"])        else None),
            "macd_signal": _nan_to_none(float(r["macd_signal"]) if pd.notna(r["macd_signal"]) else None),
            "macd_hist":   _nan_to_none(float(r["macd_hist"])   if pd.notna(r["macd_hist"])   else None),
            "computed_at": datetime.now(timezone.utc).isoformat(),
        })
    try:
        supabase.table("indicators").upsert(
            payload, on_conflict="symbol,timeframe,open_time"
        ).execute()
        return len(payload)
    except Exception as e:
        # PostgrestAPIError는 code/message/details/hint를 분리 노출. repr()로는 잘리는 경우가 있어 명시적으로 풀어 출력한다.
        code = getattr(e, "code", None)
        message = getattr(e, "message", None) or str(e)
        details = getattr(e, "details", None)
        hint = getattr(e, "hint", None)
        print(
            f"[indicators] supabase upsert error for {symbol}: "
            f"type={type(e).__name__} code={code!r} message={message!r} details={details!r} hint={hint!r}",
            flush=True,
        )
        return 0


def run() -> int:
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[indicators] FATAL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", flush=True)
        return 1

    raw_symbols = os.getenv("POLL_SYMBOLS", "BTC,ETH,SOL")
    symbols = [s.strip() for s in raw_symbols.split(",") if s.strip()]
    lookback = int(os.getenv("CANDLE_LOOKBACK", "200"))
    interval = int(os.getenv("POLL_INTERVAL_SECONDS", str(24 * 3600)))
    once = os.getenv("POLL_ONCE", "").strip() == "1"

    supabase: Client = create_client(url, key)

    signal.signal(signal.SIGINT, _request_shutdown)
    signal.signal(signal.SIGTERM, _request_shutdown)

    print(
        f"[indicators] start interval={interval}s symbols={symbols} lookback={lookback} once={once}",
        flush=True,
    )

    while True:
        total = 0
        for symbol in symbols:
            df = load_closes(supabase, symbol, lookback)
            if df.empty:
                print(f"[indicators] {symbol}: no candles, skip", flush=True)
                continue
            df_ind = compute(df)
            upserted = upsert_indicators(supabase, symbol, df_ind)
            total += upserted
            # 최신 row 1건의 값을 로깅. NaN이면 None으로 표시.
            last = df_ind.iloc[-1]
            def _fmt(x):
                return None if pd.isna(x) else round(float(x), 4)
            print(
                f"[indicators] {symbol}: upserted={upserted} rows | "
                f"latest open_time={last['open_time']} "
                f"rsi_14={_fmt(last['rsi_14'])} macd={_fmt(last['macd'])} "
                f"signal={_fmt(last['macd_signal'])} hist={_fmt(last['macd_hist'])}",
                flush=True,
            )
        print(f"[indicators] tick total_upserted={total}", flush=True)

        if once or _shutdown:
            break

        for _ in range(interval):
            if _shutdown:
                break
            time.sleep(1)
        if _shutdown:
            break

    print("[indicators] exit", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())
