# CLAUDE.md — crypto-monitoring

## 프로젝트 개요
크립토 포트폴리오 모니터링과 뉴스·지표 대시보드를 제공하는 웹 애플리케이션이다.
사용자는 수동으로 보유 자산을 입력하고, 실시간 시세·기술적 지표·뉴스 감성을 한 화면에서 확인한다.

## 현재 단계 (2026-05-18 기준)
- **Stage 0 완료** — Git/스캐폴드/GitHub(`becks0724/becks0724-04.ai_agent` **public**)/Supabase(Singapore)/Vercel(`crypto-monitoring-one.vercel.app`) 검증 완료.
- **Stage 1 MVP 완료** — `portfolio_holdings`, `price_snapshots`, RLS 4+1, 워커 시세 폴러(CoinGecko 15종, 백오프), 프론트 CRUD(Magic Link + KRW↔USD + 평가금액·손익 + 30초 polling), 검증 모두 통과.
- **auth 리팩토링 완료** — `useAuth` 훅을 `AuthProvider` Context로 승격, session/userId prop drilling 제거, `signOut`/`error` 상태 노출, env vars explicit throw.
- **Stage 2 완료** — 5개 sub-stage 모두 검증 통과.
  - 2-A 캔들 데이터 모델 (`candles` 테이블, RLS 2)
  - 2-B OHLCV 폴러 (CoinGecko `/coins/{id}/market_chart?interval=daily`, close+volume, open/high/low=close). 90일 백필 273행.
  - 2-C 공포·탐욕 지수 (Alternative.me 무료, 일 1회. 헤더 위젯 — 분류별 색상)
  - 2-D RSI 14 / MACD 12,26,9 (pandas, `indicators` 테이블 279행 적재). BTC RSI 35.80 / ETH 23.84 / SOL 41.86.
  - 2-E 차트 모달 (lightweight-charts v5.2, line chart + 최신 RSI/MACD 텍스트, ESC 닫기, 면책 문구). HoldingsList "차트" 버튼으로 호출.
- **Stage 3 뉴스 완료 (검증 통과)** — RSS 4 sources(CoinDesk/Cointelegraph/Bitcoin Magazine/Decrypt) + `news`/`news_ticker_map` 모델 + `ticker_matcher` + NewsFeed UI + `news-poll.yml` 매시간 :05 UTC. **첫 적재 102 entries / 69 ticker_links 검증 완료**.
- **Stage 2.6 coins_catalog + 동적 모드 완료** — `coins_catalog` 5000위(0006 SQL + pass1/2 rate limit 대응 폴러). price/candle/indicators 모두 POLL_SYMBOLS 비어있으면 portfolio_holdings 기반 동적 매핑(catalog 우선 → 정적 fallback). HoldingForm datalist 자동완성. FET 알트 추가 → 4 워크플로 모두 정상 동작 검증.
- **ChartModal fix** — UTCTimestamp+dedup으로 line 렌더링 안정화, MACD 값 가변 정밀도 표시.
- **워커 호스팅** — GitHub Actions cron 6개 워크플로 (price-poll 15분, fear-greed 01:00, candle-poll 01:15, indicators 01:30, news-poll 매시간 :05, **coins-catalog 02:00**). 모든 workflow_dispatch 성공. price/candle/indicators는 동적 심볼 모드 기본.
- **다음 본 작업** — Stage 4(LLM 감성, Anthropic key 필요) 또는 Stage 2.5(강세장 정점, CMC key 필요).
- 세부 진행 사항은 `progress.md`, 작업 단위 체크리스트는 `checklist.md`.

## 기술 스택
- **프론트엔드** — React + Vite (TypeScript), Vercel 배포
- **워커/백엔드** — Python 3.11, **GitHub Actions cron 호스팅** (`*/15 * * * *`, POLL_ONCE 모드. 향후 30초 폴링 등 필요 시 Fly.io 등 long-running으로 이전 검토)
- **DB** — Supabase (PostgreSQL, Singapore region)
- **외부 API** — CoinGecko 시세(공개, 키 불필요), Frankfurter.dev/open.er-api(USD/KRW 환율, 무료 폴백), CryptoPanic API, RSS 피드, LLM API (Stage 4)

## 디렉토리 구조
```
04.ai_agent/
├── .github/workflows/
│   ├── price-poll.yml       # */15 * * * * 가격 폴러 (동적 모드)
│   ├── fear-greed.yml       # 0 1 * * * 공포·탐욕 폴러
│   ├── candle-poll.yml      # 15 1 * * * 일봉 폴러 (workflow_dispatch days input, 동적 모드)
│   ├── indicators.yml       # 30 1 * * * RSI/MACD 계산 (동적 모드)
│   ├── news-poll.yml        # 5 * * * * RSS 4 sources 뉴스 폴러
│   └── coins-catalog.yml    # 0 2 * * * 시총 5000위 메타데이터 (workflow_dispatch total input)
├── frontend/                # React + Vite TS (Vercel 배포)
│   ├── src/lib/             # supabase, useAuth(AuthContext), holdings, prices, fx, errors, fearGreed, candles, indicatorsApi, news, coins
│   └── src/components/      # Login, AppShell, HoldingForm(자동완성), HoldingsList, ChartModal, NewsFeed
├── worker/                  # Python 3.11
│   ├── price_poller.py      # CoinGecko /simple/price (동적 모드)
│   ├── fear_greed_poller.py # Alternative.me /fng
│   ├── candle_poller.py     # CoinGecko /coins/{id}/market_chart (동적 모드)
│   ├── indicators.py        # pandas RSI/MACD (동적 모드)
│   ├── news_poller.py       # RSS 4 sources (CoinDesk/Cointelegraph/Bitcoin Magazine/Decrypt)
│   ├── ticker_matcher.py    # 뉴스 본문 → 심볼 키워드 매칭
│   ├── coins_catalog_poller.py # CoinGecko /coins/markets 5000위 적재 (pass1/2 재시도)
│   ├── symbol_resolver.py   # portfolio_holdings → coins_catalog 동적 매핑
│   ├── coingecko_ids.py     # 심볼 → coingecko_id 정적 매핑 (15종, fallback용)
│   └── migrations/          # 0001_init / 0002_candles / 0003_fear_greed / 0004_indicators / 0005_news / 0006_coins_catalog
├── CLAUDE.md
├── checklist.md
└── progress.md
```

## 절대 규칙
1. API 키는 환경변수로만 다룬다. 프론트엔드 번들에 절대 노출하지 않는다.
2. 거래소 API 키는 **읽기 전용**만 사용한다. 주문·출금 권한 키는 등록 자체를 금지한다.
3. 기술적 지표(RSI, MACD 등) 계산은 **worker(Python)**에서만 수행한다. 프론트에서 계산하지 않는다.
4. WebSocket 상시 연결은 Vercel(서버리스)에 두지 않는다. 상시 연결이 필요하면 별도 long-running 호스팅(Fly.io 등)으로 이전한다. 현재 워커는 GitHub Actions cron이라 WebSocket 미지원.
5. **secret은 위치별 한 곳에만**: 프론트 = Vercel Project Env Vars(VITE_* 만), 워커 = GitHub Actions Secrets(SUPABASE_SERVICE_ROLE_KEY 등). 로컬은 각자 `.env.local`/`.env`. `.env*`는 `.gitignore`로 차단.

## 범위 밖 (구현 금지)
- 자동 매매·주문 실행 기능
- 뉴스 기반 가격 "예측" 기능 — 감성 점수와 통계 표시까지만 허용한다.

## 환경변수 분리 정책
- **frontend** (`frontend/.env.local`) — Vite 클라이언트 번들로 노출됨. `VITE_` 접두사 변수만 둔다. 공개 가능한 키(Supabase anon key 등)만 허용한다.
- **worker** (`worker/.env` 또는 Railway 대시보드) — 비공개 키 전용. Supabase `service_role`, 거래소 API(읽기 전용), 뉴스/LLM API 키.
- 두 영역의 키는 **절대 교차 사용 금지**. service_role 키가 프론트에 들어가면 RLS가 무력화된다.
- `.env*` 파일은 `.env.example` 외에 모두 `.gitignore`로 제외된다. 새 키가 추가될 때마다 해당 `.env.example`도 함께 갱신한다.

## 작업 원칙 (매 세션 적용)
- 작업 시작 전 `progress.md`를 읽어 현재 상태를 파악한다.
- 작업 종료 시 `progress.md`의 "완료한 작업", "다음 할 작업"을 갱신한다.
- `checklist.md`의 체크박스를 작업 단위와 일치시킨다. 완료 시 `- [x]`로 변경한다.
- 새 파일 생성 시 첫 줄에 한국어 1줄 주석으로 파일 역할을 명시한다.
- 코드 변경 후 가능한 경우 테스트·빌드를 실행해 검증한다.
- 비밀키·자격증명은 절대 커밋하지 않는다. `.env*` 파일은 `.gitignore`에 반드시 포함한다.

## 의사결정 시 우선순위
1. 보안 — 키 노출 금지, 읽기 전용 권한
2. 단순성 — 최소 코드, 추측성 추상화 금지
3. 검증 가능성 — 각 단계가 독립적으로 동작 확인 가능해야 함
