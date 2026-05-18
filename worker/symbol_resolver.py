# portfolio_holdings의 unique 심볼을 coins_catalog로 coingecko_id 매핑한다.
# 같은 심볼이 여러 코인에 있으면 market_cap_rank가 가장 낮은(=상위) 항목을 채택.
from __future__ import annotations

from supabase import Client

_UNKNOWN_RANK = 10**9  # market_cap_rank가 null인 항목을 정렬상 가장 뒤로 보낸다.


def fetch_active_symbols(supabase: Client) -> list[str]:
    """portfolio_holdings에서 등록된 모든 unique symbol을 대문자 정렬 리스트로 반환."""
    res = supabase.table("portfolio_holdings").select("symbol").execute()
    rows = res.data or []
    return sorted({(r.get("symbol") or "").upper() for r in rows if r.get("symbol")})


def resolve_via_catalog(supabase: Client, symbols: list[str]) -> dict[str, str]:
    """symbol → coingecko_id 매핑. catalog에 없는 심볼은 결과에서 빠지며 경고만 출력."""
    if not symbols:
        return {}
    res = (
        supabase.table("coins_catalog")
        .select("symbol, coingecko_id, market_cap_rank")
        .in_("symbol", symbols)
        .execute()
    )
    rows = res.data or []
    best: dict[str, tuple[str, int]] = {}
    for r in rows:
        sym = (r.get("symbol") or "").upper()
        if not sym:
            continue
        rank = r.get("market_cap_rank")
        rank_key = rank if rank is not None else _UNKNOWN_RANK
        cur = best.get(sym)
        if cur is None or rank_key < cur[1]:
            best[sym] = (r["coingecko_id"], rank_key)
    out = {sym: meta[0] for sym, meta in best.items()}
    unknown = sorted(set(symbols) - set(out.keys()))
    if unknown:
        print(f"[resolver] WARN unresolved symbols (not in coins_catalog): {unknown}", flush=True)
    return out
