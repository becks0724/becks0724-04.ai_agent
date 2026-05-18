# 뉴스 제목/본문에서 보유 가능 심볼(BTC/ETH 등)을 word boundary 매칭으로 추출한다.
# 일반어와 충돌 위험이 있는 단어(link/ton/dot 단독)는 풀네임만 키워드에 포함시킨다.
from __future__ import annotations

import re


# 키워드(lowercase) → 정규화된 심볼. 같은 심볼에 여러 키워드를 둘 수 있다.
# 일반어 충돌 위험으로 일부러 제외한 키워드 — "link"(URL/연결), "ton"(무게단위), "dot"(점).
KEYWORDS: dict[str, str] = {
    "bitcoin": "BTC", "btc": "BTC",
    "ethereum": "ETH", "ether": "ETH", "eth": "ETH",
    "solana": "SOL", "sol": "SOL",
    "ripple": "XRP", "xrp": "XRP",
    "cardano": "ADA", "ada": "ADA",
    "dogecoin": "DOGE", "doge": "DOGE",
    "bnb": "BNB",
    "tether": "USDT", "usdt": "USDT",
    "usdc": "USDC",
    "tron": "TRX", "trx": "TRX",
    "polygon": "MATIC", "matic": "MATIC",
    "polkadot": "DOT",
    "avalanche": "AVAX", "avax": "AVAX",
    "chainlink": "LINK",
    "toncoin": "TON",
}


# 캐싱: 키워드를 word boundary 정규식으로 컴파일해 매번 escape 비용 회피.
_COMPILED: list[tuple[re.Pattern[str], str]] = [
    (re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE), sym)
    for kw, sym in KEYWORDS.items()
]


def extract_symbols(text: str) -> list[str]:
    """text에서 등장하는 심볼들의 정렬된 list를 돌려준다. 중복 제거."""
    if not text:
        return []
    found: set[str] = set()
    for pattern, symbol in _COMPILED:
        if pattern.search(text):
            found.add(symbol)
    return sorted(found)
