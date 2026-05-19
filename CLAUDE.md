# CLAUDE.md — crypto-monitoring

## 프로젝트 개요
크립토 포트폴리오 모니터링과 뉴스·지표 대시보드를 제공하는 웹 애플리케이션이다.
사용자는 수동으로 보유 자산을 입력하고, 실시간 시세·기술적 지표·뉴스 감성을 한 화면에서 확인한다.

## 현재 단계 (2026-05-19 후속 세션 기준)
- **Stage 0 완료** — Git/스캐폴드/GitHub(`becks0724/becks0724-04.ai_agent` **public**)/Supabase(Singapore)/Vercel(`crypto-monitoring-one.vercel.app`) 검증 완료.
- **Stage 1 MVP 완료 + 현재가 24h 등락률 구현 중** — `portfolio_holdings`, `price_snapshots`, RLS 4+1, 워커 시세 폴러, 프론트 CRUD 완료. 현재 `price_change_24h_pct` nullable 컬럼용 `0009` 마이그레이션과 CoinGecko `usd_24h_change` 적재/표시 구현. Supabase SQL Editor에서 0009 실행 필요(현재 Supabase는 컬럼 없음, fallback insert 검증 완료).
- **auth 리팩토링 완료** — `AuthProvider` Context 패턴, signOut/error 노출, env explicit throw.
- **Stage 2 완료** — 5개 sub-stage. 2-E는 **multi-pane 차트** — v5 `paneIndex` API로 가격(0) + RSI 14(1, 30·70 reference 점선) + MACD(2, line+Signal+Histogram, 0 reference) 세로 3단 동기 차트.
- **Stage 3 뉴스 완료** — RSS 4 sources, 102 entries / 69 ticker_links.
- **Stage 2.6 coins_catalog + 동적 모드 완료** — 5000위 catalog + 워커 동적 매핑.
- **Stage 4 LLM 분류** — Gemini 2.5 Flash-Lite, RPD 20 한도. 약 34/102 적재, cron 점진 백필.
- **Coinbase 디자인 적용 완료** — `frontend/DESIGN.md` 토큰 사양서 + Inter/JetBrains Mono + 흰 캔버스 + 단일 voltage `#0052ff` + pill 100px + xl 24px. 6개 컴포넌트(Login/AppShell/HoldingForm/HoldingsList/NewsFeed/ChartModal) 리스킨. PeakSignals 신규 컴포넌트도 동일 토큰으로 적용.
- **NewsFeed 카드 캐러셀 + 한글 번역** — 섹션 chip(감성/카테고리/종목/시간순) 점프 + ←/→ 순환 + N/M 카운터. MyMemory 무료 번역(localStorage 영구 캐시, 인접 prefetch). 영문 원본은 작은 회색 이탤릭 보조.
- **Stage 2.5 진행 중 (16 / ~23 = 69.6%)** — `peak_signals` 테이블 + 워커 + cron 02:30 UTC + 프론트 표 UI. 16개 지표 로컬 적재 검증:
  - **status=ok 14** — 자체계산 5(Mayer/Pi Cycle/RSI22/AHR999/Rainbow) + 도미넌스(CoinGecko) + 온체인 4(Puell/MVRV-Z/NUPL/MVRV via bitcoin-data.com) + ETF flow 2(Farside + CoinGecko proxy) + MSTR 2(CoinGecko `/companies/public_treasury/bitcoin`)
  - **status=insufficient_data 2** — `two_year_ma_multiple`(730d 필요, 현 372d, candle-poll 누적으로 자동 활성화) / `altcoin_season_index`(CMC_API_KEY 사용자 액션 대기)
  - **보류** — USDT Flexible Savings(Binance Earn 스크랩 안정성 낮음) / CoinGlass Hobbyist $29/월 결정 / Bull Market Support Band(정점 신호 부적합)
- **헤더 지표** — Fear & Greed 옆에 Altcoin Season Index 배지를 추가. CMC key 미발급 상태는 `Altcoin Season 대기`로 표시.
- **운영 안정화** — bitcoin-data.com 분당 한도(60s cooldown) 대응 — 첫 retry 60초 fixed sleep + upsert 가드(`status='error'`는 같은 captured_at에 ok 행 있으면 skip).
- **워커 호스팅** — GitHub Actions cron **8개 워크플로** (price-poll 15분, fear-greed 01:00, candle-poll 01:15, indicators 01:30, news-poll 매시간 :05, coins-catalog 02:00, news-classify 매시간 :15, **peak-signals 02:30**). `peak-signals.yml`은 workflow_dispatch 검증 성공(run `26081203527`), 최신 16행 적재 확인.
- **최근 push 완료** — `bfef5e2 feat(stage2.5): add ETF flow peak signals`로 ETF 2개 지표를 배포하고 `11b1c82 fix(frontend): keep peak signal badges on one line`로 `미명중` 배지 줄바꿈 수정까지 Vercel Production success. 운영 URL `https://crypto-monitoring-one.vercel.app/` HTTP/2 200 확인.
- **다음 본 작업** — Supabase SQL Editor에서 `worker/migrations/0009_price_change_24h.sql` 실행 → price-poll 1회 실행으로 24h 등락률 적재 확인 → CMC Pro Basic key 발급(2.5-B0 활성화) → 2026-05-20 이후 peak-signals cron 자동 발화 16행 관측 → CoinGlass 결정/USDT Flexible Savings 보류 재평가.
- 세부 진행 사항은 `progress.md`, 작업 단위 체크리스트는 `checklist.md`, 디자인 토큰은 `frontend/DESIGN.md`.

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
│   ├── coins-catalog.yml    # 0 2 * * * 시총 5000위 메타데이터 (workflow_dispatch total input)
│   ├── news-classify.yml    # 15 * * * * Gemini 분류 (workflow_dispatch batch input)
│   └── peak-signals.yml     # 30 2 * * * 강세장 정점 신호 16 지표 계산
├── frontend/                # React + Vite TS (Vercel 배포)
│   ├── DESIGN.md            # Coinbase 디자인 토큰 사양서 (getdesign add coinbase)
│   ├── src/lib/             # supabase, useAuth(AuthContext), holdings, prices, fx, errors, fearGreed, candles, indicatorsApi, news, coins, peakSignals, translate
│   └── src/components/      # Login, AppShell, HoldingForm(자동완성), HoldingsList, ChartModal(multi-pane), NewsFeed(카드 캐러셀+번역), PeakSignals
├── worker/                  # Python 3.11
│   ├── price_poller.py      # CoinGecko /simple/price + usd_24h_change (동적 모드)
│   ├── fear_greed_poller.py # Alternative.me /fng
│   ├── candle_poller.py     # CoinGecko /coins/{id}/market_chart (동적 모드)
│   ├── indicators.py        # pandas RSI/MACD (동적 모드)
│   ├── news_poller.py       # RSS 4 sources (CoinDesk/Cointelegraph/Bitcoin Magazine/Decrypt)
│   ├── ticker_matcher.py    # 뉴스 본문 → 심볼 키워드 매칭
│   ├── coins_catalog_poller.py # CoinGecko /coins/markets 5000위 적재 (pass1/2 재시도)
│   ├── symbol_resolver.py   # portfolio_holdings → coins_catalog 동적 매핑
│   ├── news_classifier.py   # Gemini 2.5 Flash-Lite (sentiment + event_category, JSON 응답)
│   ├── peak_signals_poller.py # BTC 도미넌스/자체계산/온체인/Farside ETF/MSTR/CMC 지표
│   ├── coingecko_ids.py     # 심볼 → coingecko_id 정적 매핑 (15종, fallback용)
│   └── migrations/          # 0001_init ... 0009_price_change_24h
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

## 디자인 시스템 (2026-05-18 후속 적용)
- **출처** — `frontend/DESIGN.md` (`npx getdesign@latest add coinbase` 생성). 전체 토큰·컴포넌트 사양은 이 파일을 기준으로 한다.
- **voltage** — Coinbase Blue `#0052ff` 단 하나. primary CTA / brand wordmark / 인라인 강조 링크에만 사용.
- **trading semantics** — up `#05b169` / down `#cf202f`는 텍스트 컬러로만. 배경 fill 금지.
- **geometry** — pill 100px(액션·탭·배지) / xl 24px(카드) / full 9999px(아이콘) / md 12px(input). sharp 0px 금지.
- **typography** — `Inter`(CoinbaseDisplay/Sans 대체) + `JetBrains Mono`(CoinbaseMono 대체). 모든 숫자는 mono 폰트.
- **rhythm** — 흰 캔버스 + soft gray(#f7f7f7) + hairline(#dee1e6). 단일 shadow tier.
- 새 UI 추가 시 `frontend/DESIGN.md` 토큰을 먼저 참조한 뒤 컴포넌트를 작성한다.
