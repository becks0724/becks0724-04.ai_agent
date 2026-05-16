# 거래소 심볼(BTC, ETH 등)을 CoinGecko id(bitcoin, ethereum)로 매핑한다.
# Stage 1 MVP 기준 소수 자산만 하드코딩. 자산 확장 시 본 파일을 갱신한다.
from __future__ import annotations

# 주의: CoinGecko id는 소문자 + 하이픈 구분(예: "binancecoin", "ripple"). 임의 추정 금지.
SYMBOL_TO_COINGECKO_ID: dict[str, str] = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "XRP": "ripple",
    "ADA": "cardano",
    "DOGE": "dogecoin",
    "BNB": "binancecoin",
    "USDT": "tether",
    "USDC": "usd-coin",
    "TRX": "tron",
    "MATIC": "matic-network",
    "DOT": "polkadot",
    "AVAX": "avalanche-2",
    "LINK": "chainlink",
    "TON": "the-open-network",
}


def resolve_ids(symbols: list[str]) -> dict[str, str]:
    """입력 심볼 리스트 중 매핑된 항목만 {symbol: coingecko_id}로 반환한다."""
    resolved: dict[str, str] = {}
    unknown: list[str] = []
    for raw in symbols:
        sym = raw.strip().upper()
        if not sym:
            continue
        cg_id = SYMBOL_TO_COINGECKO_ID.get(sym)
        if cg_id is None:
            unknown.append(sym)
            continue
        resolved[sym] = cg_id
    if unknown:
        # 알 수 없는 심볼은 무시하되 로그로 노출. 폴러 전체 실패는 피한다.
        print(f"[poller] WARN unknown symbols ignored: {unknown}", flush=True)
    return resolved
