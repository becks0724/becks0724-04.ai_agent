# checklist.md — crypto-monitoring

작업 단위 체크리스트. 완료 시 `- [x]`로 변경한다.

---

## Stage 0 · 프로젝트 초기 셋업 ✓ 완료 (Railway 보류 제외)

- [x] Git 저장소 초기화 및 `.gitignore` 작성 (`.env*`, `node_modules`, `__pycache__`, `.venv` 포함)
- [x] `frontend/` 디렉토리 생성, Vite + React(TypeScript) 템플릿 초기화 — `npm run build` 통과 확인
- [x] `worker/` 디렉토리 생성, `requirements.txt`·`main.py`(hello world) 초기 생성
- [x] GitHub 원격 저장소 연결 — `becks0724/04.ai_agent` (private), `main` push 완료
- [x] Python 3.11 설치 + `worker/.venv` 생성 + `python main.py` hello world 출력 확인
- [x] Supabase 프로젝트(`becks0724's Project`, Singapore) 생성, publishable/secret 키를 `frontend/.env.local`·`worker/.env`에 기입 + 차단·로드 검증 완료
- [x] Vercel 프로젝트 연결 (frontend) — Root=`frontend`, `VITE_SUPABASE_*` 등록, `https://crypto-monitoring-one.vercel.app` 배포 + 번들 보안 검색(sb_secret/service_role 0건) 통과
- [~] **(보류, Stage 1 종료 시 재검토)** Railway 프로젝트 연결 — Railway trial 만료로 결제 필요. `main.py`가 즉시 종료 스크립트라 현 시점 배포 검증의 실익이 낮음. 로컬 hello world(`env=local`) 검증은 완료. Stage 1에서 long-running 폴러 완성 후 Railway 유료 / Render / Fly 중 결정.
- [x] 프론트 ↔ 워커 ↔ Supabase 환경변수 분리 정책 문서화 (`CLAUDE.md` "환경변수 분리 정책" 섹션 + `.env.example` 2종)

---

## Stage 1 · MVP — 수동 입력 포트폴리오 + 거래소 시세 폴링 ★ 현재 진행

### 1-A. 데이터 모델 ✓ 완료 (2026-05-16)
- [x] Supabase `portfolio_holdings` 테이블 설계 (id, user_id, symbol, quantity, avg_buy_price, created_at, updated_at)
- [x] Supabase `price_snapshots` 테이블 설계 (id, symbol, price_usd, fetched_at)
- [x] Supabase `price_snapshots.price_change_24h_pct` 확장 SQL 작성 — `worker/migrations/0009_price_change_24h.sql`
- [ ] Supabase SQL Editor에서 `0009_price_change_24h.sql` 실행 — 현재 Supabase `42703` 확인, 로컬 DB URL/psql 없음, 사용자 SQL 적용 필요
- [x] RLS(Row Level Security) 정책 — 본인 데이터만 접근 가능하도록 설정
- [x] 마이그레이션 SQL을 `worker/migrations/` 또는 Supabase migrations에 저장 — `worker/migrations/0001_init.sql`
- [x] Supabase SQL Editor에서 `0001_init.sql` 실행 → 테이블·정책 생성 확인 (holdings 4 RLS policies, snapshots 1 RLS policy)

### 1-B. 워커 — 시세 폴링 ★ 진행 중 (배포만 남음)
- [x] 거래소 시세 API 선택 — CoinGecko `/simple/price` (키 불필요)
- [x] `worker/price_poller.py` 작성 — N초 간격으로 가격 조회 후 `price_snapshots`에 적재
- [x] CoinGecko `include_24hr_change=true` 적용 — `usd_24h_change`를 `price_change_24h_pct`로 적재
- [x] 0009 미적용 시 fallback insert — 기존 가격 적재는 유지하고 경고 로그 출력
- [x] price-poll 1회 fallback 검증 — 0009 미적용 상태에서 `inserted=3/3`
- [x] 폴링 주기·심볼 목록을 환경변수로 분리 — `POLL_INTERVAL_SECONDS`, `POLL_SYMBOLS`, `POLL_ONCE`
- [x] 에러 핸들링 (rate limit 429, 네트워크 오류, 지수 백오프 2/4/8s, SIGINT/SIGTERM graceful shutdown)
- [ ] Railway(유료) 또는 Render/Fly(무료 대안) 중 결정 후 long-running 프로세스로 배포
- [x] 로컬 1회 수동 실행 → Supabase에 레코드 적재 확인 (BTC/ETH/SOL 3건, service_role select 검증 완료)

### 1-C. 프론트엔드 — 포트폴리오 CRUD ✓ 완료 (2026-05-16)
- [x] Supabase 클라이언트 셋업 (`@supabase/supabase-js`, `lib/supabase.ts`)
- [x] 인증 페이지 — Supabase Auth Magic Link (`Login.tsx`, redirect Site URL 등록)
- [x] 보유 자산 등록 폼 (symbol, quantity, avg_buy_price) — KRW↔USD 양방향 환산 (Frankfurter→open.er-api 폴백)
- [x] 보유 자산 목록 조회·수정·삭제 UI (`HoldingsList.tsx`) — 인라인 수정, 삭제 확인 다이얼로그
- [x] 최신 가격 조회 → 평가금액·손익 계산·표시 — `price_snapshots` dedupe 조회, USD/KRW 모두 표시
- [x] 현재가 하단 24시간 등락률 표시 — 상승 빨강, 하락 파랑, 보합/데이터 없음 회색
- [x] 상단 헤더 Altcoin Season Index 배지 추가 — CMC key 대기 시 `Altcoin Season 대기` 표시
- [x] 보유 자산 카드 우측 `숨기기/펼치기` 토글 추가
- [x] 가격 자동 갱신 — 30초 polling (Realtime은 Stage 5)

### 1-D. 검증
- [x] 보유 자산 1건 등록 → 평가금액이 가격 변동에 따라 갱신되는지 확인 (워커 무한 폴링 + 30초 프론트 폴링) — 2026-05-16
- [x] 다른 사용자가 내 데이터를 조회할 수 없는지 RLS 검증 — 2026-05-16 (woojinchang0728@gmail.com / becks0728@naver.com 두 계정 격리 확인. DB에는 두 행 모두 존재, 프론트에서는 각자 본인 행만 표시)
- [x] 프론트 번들에 API 키가 포함되지 않는지 빌드 산출물 재검사 — `sb_publishable` 1, `sb_secret`/`service_role` 0, service_role 본문 텍스트 0
- [x] Vercel + Supabase end-to-end 동작 확인 — 2026-05-16 (Vercel `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` Production/Preview 등록, Supabase URL Configuration에 prod 도메인 redirect 추가, prod에서 매직링크 로그인·요약·목록·평가금액 모두 정상)
- [x] (Railway 보류 항목) 워커 long-running 호스팅 결정 — **GitHub Actions cron (15분 간격)** 선택. 비용 0, 무료 한도 충분. `.github/workflows/price-poll.yml` 작성. POLL_ONCE 모드로 15분마다 1회 실행 (초기 5분 시도했으나 무료 plan 발화 지연으로 15분으로 조정).
  - [x] GitHub Repository Secrets에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록 — 2026-05-17
  - [x] workflow_dispatch로 1회 수동 실행 → Supabase `price_snapshots`에 id 7-9 (BTC 78078 / ETH 2178.19 / SOL 86.36) 적재 확인 — 2026-05-17 00:19 KST
  - [x] repo private → public 전환 (cron 발화 안정성 보강, 사전 검증 통과 후) — 2026-05-17 01:40 KST
  - [x] cron schedule 자동 실행 누적 확인 — 2026-05-17 02:00 KST, 24h+ 0건. GitHub Free best-effort 한계로 **잠정 결론**: 수동 트리거 + 필요 시 외부 cron/Fly.io 검토 (사용자 액션 필요로 보류)

---

## Stage 1 후속 · auth 리팩토링 ✓ 완료 (2026-05-17)

- [x] `useAuth` 훅을 `AuthProvider` Context 패턴으로 승격 (`useAuth.ts` → `useAuth.tsx`)
- [x] `session`/`userId` prop drilling 제거 (AppShell, HoldingForm이 `useAuth()` 직접 호출)
- [x] 반환값에 `user`, `error`, `signOut` 추가 (`signOut` hook 노출로 supabase 직접 import 제거)
- [x] `supabase.ts` env 미설정 시 silent fail → explicit throw
- [x] `main.tsx`에서 `<AuthProvider>` 래핑
- [x] `App.tsx`에서 error+세션없음 케이스 분기 추가
- [x] `HoldingForm`에 세션 만료 가드 추가 (`user` null이면 등록 차단)
- [x] `npm run build` 통과 (407KB / gzip 115KB)
- [x] 번들 보안 검증 (sb_publishable 1, sb_secret/service_role 0)
- [x] 로컬 dev 검증 — Login 렌더링·에러 노출 OK. 풀 시나리오는 OTP rate limit으로 prod에서 종결
- [x] 커밋 `74ccac6` 푸시 → Vercel 자동 배포

---

## Stage 2 · 캔들 수집 + 기술적 지표 + 공포·탐욕 지수 ★ 현재 진행

> 설계 결정 (2026-05-17)
> - **timeframe** — 시작은 `1d` 일봉만 적재. 스키마는 `1m/5m/15m/1h/4h/1d` 허용으로 확장 가능.
> - **저장 기간** — 무제한 누적. 매일 최신 1건씩 UPSERT (UNIQUE로 중복 방지).
> - **OHLCV 출처** — CoinGecko `/coins/{id}/ohlc` (volume 미제공, close 위주 지표 계산엔 충분).
> - **공포·탐욕 출처** — Alternative.me 무료 API (CMC Pro key 미발급으로 1차 폴백).
> - **시작 순서** — 2-A → 2-C(독립적·가벼움) → 2-B → 2-D → 2-E.

### 2-A. 데이터 모델 ✓ 완료 (2026-05-17)
- [x] `worker/migrations/0002_candles.sql` — candles 테이블 (symbol, timeframe, open_time, OHLC + volume nullable), UNIQUE, CHECK, RLS 2정책
- [x] Supabase SQL Editor 실행 — 정책 2건 검증 (candles_authenticated_select, candles_service_role_write)

### 2-B. OHLCV 수집 잡 (워커) ✓ 완료 (2026-05-17)
- [x] CoinGecko `/coins/{id}/market_chart?interval=daily` 채택 (무료 plan ohlc는 일봉 미제공 → market_chart의 close+volume으로 대체. open/high/low=close)
- [x] `worker/candle_poller.py` — 일 1회 잡, BTC/ETH/SOL UPSERT (on_conflict=symbol,timeframe,open_time)
- [x] `.github/workflows/candle-poll.yml` — 매일 01:15 UTC
- [x] workflow_dispatch 첫 실행 성공 — BTC/ETH/SOL 각 3행, 총 9건 적재 (run 25970172890, 22s)

### 2-C. 공포·탐욕 지수 ✓ 완료 (2026-05-17)
- [x] `worker/migrations/0003_fear_greed.sql` — fear_greed 테이블 (value, classification, captured_at UNIQUE), RLS 2정책
- [x] Supabase SQL Editor 실행 — 정책 2건 검증
- [x] `worker/fear_greed_poller.py` — Alternative.me `/fng/?limit=1`, captured_at upsert (멱등)
- [x] `.github/workflows/fear-greed.yml` — 매일 01:00 UTC
- [x] workflow_dispatch 첫 실행 성공 — value=31, classification='Fear', captured_at=2026-05-16 (run 25969876326, 21s)
- [x] 프론트 — `frontend/src/lib/fearGreed.ts` + AppShell 헤더 위젯 (분류별 색상, hover 시 기준일 툴팁). 빌드 408.66KB / gzip 115.96KB

### 2-D. RSI/MACD 계산 ✓ 완료 (2026-05-18)
- [x] 계산 정책 — **사전 계산 후 indicators 테이블 저장** (일봉 빈도 낮음, view보다 단순)
- [x] `worker/migrations/0004_indicators.sql` — indicators 테이블 (rsi_14, macd, macd_signal, macd_hist), UNIQUE, RLS 2정책
- [x] `worker/indicators.py` — pandas로 RSI 14 / MACD 12,26,9, UPSERT
- [x] `.github/workflows/indicators.yml` — 매일 01:30 UTC (candle-poll 직후)
- [x] requirements.txt에 pandas 추가
- [x] Supabase 0004 SQL 실행 + indicators workflow_dispatch 검증
- [x] **candle-poll에 `days` workflow input 추가** + 90일 백필 (`gh workflow run candle-poll.yml -f days=90` → 273행 적재)
- [x] indicators 재트리거 검증 — BTC RSI 35.80 / ETH 23.84 / SOL 41.86 (의미있는 값), MACD 정상. 총 279행 indicators 적재
- [x] indicators 워커 에러 메시지 상세화 (PostgrestAPIError code/message/details/hint 분리)

### 2-E. 프론트 차트 + 지표 UI ✓ 완료 (2026-05-18)
- [x] 차트 라이브러리 선택 — **lightweight-charts v5.2** (TradingView, 캔들/라인/지표 모두 지원)
- [x] `frontend/src/lib/candles.ts` — Supabase 조회 헬퍼 (open_time 오름차순, 200건 한도)
- [x] `frontend/src/lib/indicatorsApi.ts` — RSI/MACD 조회 헬퍼
- [x] `ChartModal` 컴포넌트 — line chart (캔들은 OHLC=close라 단순화)
- [x] RSI / MACD 보조 패널 — **v5 `paneIndex` multi-pane API로 세로 3단 동기화 차트**. pane 0 가격 / pane 1 RSI(30·70 reference) / pane 2 MACD line + Signal line + Histogram(±컬러). 최신값 5개 Stat 카드 + 레전드 dot
- [x] HoldingsList의 각 행에 "차트" 버튼 → 모달로 표시 (ESC 닫기 + backdrop click 닫기)
- [x] "통계 표시 전용, 매매 신호 아님" 면책 문구

---

## Stage 2.5 · 강세장 정점 신호 (Bull Market Peak Signals) ★ 진행 중

> **진행률 — 16 / ~23 = 69.6%** (2026-05-19 기준. Coinglass 30개 카탈로그 중 무료 가용 18-23개 기준)
>
> 적재 상태 (workflow_dispatch 검증 완료, cron 매일 02:30 UTC):
> - **status=ok** 14개 — 자체계산 5(Mayer/Pi Cycle/RSI22/AHR999/Rainbow) + 도미넌스(CoinGecko) + 온체인 4(Puell/MVRV-Z/NUPL/MVRV via bitcoin-data.com) + ETF flow 2(Farside + CoinGecko proxy) + MSTR 2(CoinGecko treasury)
> - **status=insufficient_data** 2개 — `two_year_ma_multiple`(730d 필요, 현재 372d) / `altcoin_season_index`(CMC_API_KEY 사용자 액션 대기)
> - **보류** — USDT Flexible Savings(Binance Earn 스크랩 안정성 낮음) / CoinGlass Hobbyist $29/월 결정 / Bull Market Support Band(정점 신호 부적합)
>
> 참고 페이지
> - Coinglass `bull-market-peak-signals` (30개 카탈로그) — https://www.coinglass.com/bull-market-peak-signals
> - CoinMarketCap `crypto-market-cycle-indicators` — https://coinmarketcap.com/ko/charts/crypto-market-cycle-indicators/ (Pi Cycle / Puell / Rainbow 등 핵심 지표)
> - CoinMarketCap `altcoin-season-index` — https://coinmarketcap.com/ko/charts/altcoin-season-index/
>
> 결정 (2026-05-16, 갱신)
> - 데이터 출처 전략 — **CMC 공식 API + CoinGecko 자체 계산 혼합**. 페이지 스크래핑·유료 API(Glassnode/Coinglass) 미도입.
> - 출처 우선순위 — 동일 지표가 양쪽에 있으면 **CMC API 우선**(공식·안정), 없으면 CoinGecko 종가로 자체 계산.
> - **Coinglass 30개 1:1 대체는 불가능**. 무료 한도 안에서 가능한 ~18-20개만 구현, 나머지는 N/A 표시.
>
> 구현 시점 — Stage 1·2 완료 후. Stage 1-C 진입 우선.
> 표시 정책 — CLAUDE.md "가격 예측 기능 없음" 원칙은 유지. 본 지표는 공개 통계의 **표시·이력**이며 매매 신호로 해석시키지 않는다. UI에 면책 문구 필수.

### 사용자 액션 보드 (Stage 2.5 활성 대기)

| # | 액션 | 효과 | 상태 |
|---|---|---|---|
| 1 | CMC Pro Basic key 발급 + worker/.env + GitHub secret | `altcoin_season_index` insufficient_data → ok | 대기 |
| 2 | (선택) CoinGlass Hobbyist $29/월 결제 + key | ETF flow + 추가 지표 통합 가능 | 보류 결정 |
| 3 | (자동) candle-poll 매일 누적 ~356일 | `two_year_ma_multiple` insufficient_data → ok 자동 활성화 | 자동 진행 |

### 2.5-A. 인프라 ★ 1차 구현 완료 (2026-05-18, 키 불필요 지표 3종)
- [ ] **사용자 액션** — CoinMarketCap Pro API key 발급 (Basic 무료 plan: 30 req/min, 10,000 credits/월) — 2.5-B0 진행 시 필요
- [ ] `worker/.env`에 `CMC_API_KEY` 추가 + `.env.example` 갱신 — CMC key 발급 후
- [x] `peak_signals` 테이블 설계 — `worker/migrations/0008_peak_signals.sql` (signal_key, value, threshold, hit, progress_pct, source, status, note, captured_at, UNIQUE(signal_key, captured_at), RLS 2정책)
- [x] **사용자 액션** — Supabase SQL Editor에서 `0008_peak_signals.sql` 실행
- [x] 워커 일일 수집 잡 — `worker/peak_signals_poller.py` (CoinGecko `/global` + BTC candles 200/350dMA 자체 계산)
- [x] `.github/workflows/peak-signals.yml` — cron `30 2 * * *` (candle-poll/indicators 이후)
- [x] **첫 검증 (2026-05-18)** — workflow_dispatch peak-signals 1회 실행 후 3종 적재 확인
- [x] 프론트 — `frontend/src/lib/peakSignals.ts` + `PeakSignals.tsx` (signal_key별 최신 1행, 명중·평균 진행률 헤더, 진행률 막대, 면책)
- [x] AppShell 통합 — 포트폴리오 ↔ 뉴스 사이에 PeakSignals 섹션 배치
- [x] **BTC 캔들 365일 백필** — `gh workflow run candle-poll.yml -f days=365` (Pi Cycle 350d 요구분 충당)

### 2.5-B0. CMC 공식 API 사용 ★ 1차 구현 (2026-05-18 후속, 사용자 키 대기)

> 설계 결정 (2026-05-18 후속)
> - **endpoint 검증** — CMC docs WebFetch에서 정확한 path 못 추출. 추정 `/v1/altcoin-season-index/latest` 채택. 키 발급 후 사용자 1회 호출로 검증 필요. 잘못된 path면 워커가 status='error' + note에 path 노출 → 보정 가능.
> - **응답 구조** — `{ status: { error_code, ... }, data: { ... } }` envelope 가정. data 안의 키는 `value` / `altcoin_season_index` / `index` 순으로 시도. 실제 키가 다르면 note에 응답 키 목록 노출 → 보정.
> - **CMC Fear & Greed skip** — Alternative.me 무료 endpoint가 이미 적재 중. 중복 출처라 도입 가치 낮음.
> - **Cycle Indicators 페이지 위젯 (Pi Cycle/Puell/Rainbow)** — 별도 API endpoint 존재 확인 안 됨. 2.5-B1·D에서 이미 자체 계산·bitcoin-data.com으로 커버. CMC 별도 통합 불필요.

#### 코드 (사용자 키 없이도 적재 동작)
- [x] `fetch_cmc(path, params)` 공통 헬퍼 — `X-CMC_PRO_API_KEY` 헤더 + envelope status 검사 + 429/401/403/404 분기 처리
- [x] `compute_altcoin_season_index(captured_at)` — `CMC_API_KEY` env 없으면 `insufficient_data` note='사용자 액션 대기'. endpoint 호출 실패 시 `error` + note에 path 노출
- [x] run_once computations에 `altcoin_season_index` 람다 추가
- [x] `lib/peakSignals.ts` SIGNAL_META 추가 + DISPLAY_ORDER 확장
- [x] 드라이런 검증 (key 없는 경우) — `altcoin_season_index` row가 `status=insufficient_data`로 정상 적재 확인
- [x] 빌드 — 610KB / gzip 179.7KB

#### 사용자 액션 (4단계, ETF flow와 동일 패턴)
- [ ] **① CMC 가입** — https://coinmarketcap.com/api/ "Get Your Free API Key Now" 또는 https://pro.coinmarketcap.com/signup
- [ ] **② Basic 무료 plan 확인** — 가입 시 자동 Basic ($0). 10k credits/월, 30 req/min.
- [ ] **③ API key 발급** — https://pro.coinmarketcap.com/account 에서 자동 발급된 키 복사 (Profile → API Keys). 본문 채팅 노출 금지.
- [ ] **④ 키 저장 (2곳)**:
  - 로컬: `worker/.env`에 `CMC_API_KEY=<발급값>`
  - GitHub Actions: `gh secret set CMC_API_KEY` 또는 UI

#### 키 발급 후 검증 (사용자 신호 시)
- [ ] `POLL_ONCE=1 .venv/bin/python3 peak_signals_poller.py` 로컬 실행 → `altcoin_season_index` 행을 보고:
  - `status=ok value=<숫자>` → endpoint·응답 키 정확. cron 자동 적재 진행.
  - `status=error note="404"` → endpoint path 오류. note의 path를 사용자가 docs와 대조 → 보정.
  - `status=error note="response keys: [...]"` → endpoint OK, value 키 이름 다름. note의 키 목록으로 코드 보정.

### 2.5-B1. CoinGecko 가격으로 자체 계산 (CMC API에 없을 때 폴백·또는 무료 유지)
- [x] **AHR999 지수** — `BTC / 200d_geomean_MA × growth_factor` (대략). `ahr999` 구현 완료.
- [ ] **AHR999x 고점 회피** — AHR999 변형. 정의 확정 후 진행.
- [x] **Pi Cycle Top** — `111dMA` vs `350dMA × 2` 교차. `pi_cycle_top` 구현 완료.
- [x] **2년 MA 배수** — `price / 2yMA`. `two_year_ma_multiple` skeleton 구현 완료, 730일 데이터 누적 전까지 `insufficient_data`.
- [ ] **4년(1460d) 이동평균선** — `price / 1460dMA` *(CoinGecko 무료 365일 한도 → 워커가 매일 종가 적재 후 누적 5년치 직접 보유 필요)*.
- [x] **Mayer Multiple** — `price / 200dMA`. `mayer_multiple` 구현 완료.
- [x] **레인보우 차트** — 로그 회귀 밴드 (오픈소스 회귀식 사용). `rainbow_band` 구현 완료.
- [x] **RSI 22일** — 일봉 종가 기반 RSI 계산. `btc_rsi_22` 구현 완료.
- [x] **비트코인 도미넌스** — CoinGecko `/global` API 직접. `btc_dominance` 구현 완료.
- [ ] **골든 레이쇼 멀티플라이어** — `price / 350dMA × ratio`. 회귀/ratio 정의 확정 후 진행.
- [ ] **CBBI** — 여러 하위 지표 가중평균 (자체 정의 필요).
- [ ] **Smithson의 예측** — 175k~230k 범위 비교 (단순 임계값).
- [ ] **비트코인 트렌드 지표** — 정의 불명확. 정의 확정 후 구현.

### 2.5-C. 무료 외부 페이지에서 스크랩/수집 가능
- [x] **ETF 순유출 일수** — Farside 공개 BTC ETF flow 표 파서 + `etf_outflow_streak` 구현 완료. Cloudflare 차단 시 `status=error`로 운영 가시화.
- [x] **ETF/BTC 비율** — Farside 누적 순유입 / CoinGecko BTC 시총 proxy로 `etf_net_flow_btc_mcap_pct` 구현 완료. Farside는 보유 BTC 수량이 아니라 USD flow만 제공하므로 UI 설명에 proxy 명시.
- [x] **MicroStrategy 평균 매입 단가/손익 대체 지표** — Saylortracker/SEC 직접 파싱 대신 CoinGecko public treasury로 `mstr_btc_holdings`, `mstr_pnl_ratio` 구현 완료.
- [ ] **USDT 플렉서블 세이빙** — Binance Earn 공개 페이지 (스크랩 안정성 ★ 낮음).

### 2.5-D. 온체인 데이터 필요 — 무료 한도 안에서 가능한 것만 (보류 가능성 ★)
> 무료 대안 후보 — `mempool.space` (UTXO 통계), `Blockchain.com Charts`, `CoinMetrics community` (일부 무료), `bitcoin-data.com` API.
- [x] **Puell Multiple** — 일일 발행량 × 가격 / 365d 평균. `bitcoin-data.com` 구현 완료.
- [x] **MVRV Z-Score** — Market cap vs Realized cap. `bitcoin-data.com` 구현 완료.
- [x] **NUPL (미실현 손익)** — Realized cap 필요. `bitcoin-data.com` 구현 완료.
- [ ] **RHODL 비율** — Glassnode 의존. 무료 대안 부재. **보류**.
- [ ] **Reserve Risk** — Glassnode 의존. **보류**.
- [x] **MVRV 비율** — `bitcoin-data.com` 구현 완료.
- [ ] **LTH Supply / STH Supply%** — Glassnode 의존. **보류**.
- [ ] **Bitcoin Macro Oscillator (BMO)** — Glassnode 의존. **보류**.
- [ ] **Bitcoin Terminal Price** — Glassnode 의존. **보류**.
- [ ] **비트코인 버블 지수** — 정의 불명확. **보류**.
- [ ] **3개월 연환산 비율** — 정의 불명확. **보류**.
- [ ] **CBBI** (재게재) — 위 자체계산 항목과 통합.

### 2.5-E. UI / 결과 검증
- [x] 프론트 표 UI (컬럼 # / 지표 / 현재값 / 기준값 / 명중 / 진행률 / 비고)
- [x] 명중률 헤더 (명중 X/Y, 평균 진행률)
- [x] "통계 표시 전용 · 매매 신호 아님" 면책 문구
- [x] `미명중`/`대기`/`오류` pill 한 줄 표시 보정 (컬럼 최소 폭 + `whiteSpace: nowrap`)
- [x] 강세장 정점 신호 우측 `숨기기/펼치기` 토글 추가
- [ ] 과거 데이터 차트 (소형 sparkline 또는 상세 모달)

> 예상 구현 가능 범위 — CMC API(2.5-B0) 2-3개 + 자체 계산(2.5-B1) 13개 + 외부 페이지(2.5-C) 4개 + 온체인 무료(2.5-D 일부) 1-3개 = **약 20-23개 / 30개**. 나머지는 N/A 표시.

---

## Stage 3 · 뉴스 수집 + 티커 매핑 ★ 진행 중 (검증 대기)

> 설계 결정 (2026-05-18)
> - **출처** — RSS 우선 (키 불필요). CryptoPanic은 사용자 키 발급 후 추가 옵션으로 보류.
> - **RSS 소스 4종** — CoinDesk, Cointelegraph, Bitcoin Magazine, Decrypt.
> - **티커 매칭** — 키워드 word-boundary 매칭. 일반어 충돌 위험으로 `link`/`ton`/`dot` 단독 키워드 제외(`chainlink`/`toncoin`/`polkadot` 풀네임만 허용).
> - **중복 제거** — `news.url` UNIQUE upsert로 충분. 콘텐츠 해시는 동일 URL 재발행 빈도 낮아 보류.
> - **주기** — 매시간 :05 UTC (cron `5 * * * *`).

- [x] RSS 피드 파서 (worker) — `worker/news_poller.py`, feedparser + httpx, 4 sources, dry-run 92 entries 파싱 확인
- [x] 뉴스 저장 테이블 설계 — `worker/migrations/0005_news.sql` (news.url UNIQUE + news_ticker_map composite PK, 각 RLS 2정책)
- [x] 본문에서 티커 추출 → 매핑 테이블 — `worker/ticker_matcher.py` 키워드 dict 17개 → 13 심볼 매핑
- [x] 중복 뉴스 제거 — news.url UNIQUE 제약 + supabase upsert(on_conflict=url)
- [x] 프론트 뉴스 피드 UI — 보유 종목 필터링 — `frontend/src/lib/news.ts` + `NewsFeed.tsx` (보유/전체 탭, 5분 polling)
- [x] GitHub Actions — `.github/workflows/news-poll.yml` (cron `5 * * * *` + workflow_dispatch feeds input)
- [x] **검증 완료 (2026-05-18)** — 0005 SQL 실행 + workflow_dispatch news-poll → 102 entries / 69 ticker_links 적재 (coindesk 25/14, cointelegraph 30/25, bitcoinmagazine 10/10, decrypt 37/20)
- [~] CryptoPanic API 클라이언트 (worker) — **보류**. 사용자 키 발급 후 별도 폴러 또는 news_poller에 어댑터 추가
- [ ] prod URL 시각 검증 — NewsFeed 보유 종목 탭/전체 탭 동작 확인

---

## Stage 2.6 · coins_catalog 5000위 + 워커 동적 모드 ✓ 완료 (2026-05-18)

> 설계 결정 (2026-05-18)
> - 동기 — 사용자가 FET 등 알트코인을 추가했을 때 워커가 시세를 못 가져옴. 정적 `coingecko_ids.py` 15종 한계.
> - **출처** — CoinGecko `/coins/markets?per_page=250&page=1..20` (시총 5000위, 일 1회 갱신).
> - **rate limit 대응** — page_sleep 4초 + 백오프 4/16/64s + pass1 후 누락 페이지만 60s cooldown 후 pass2 재시도.
> - **심볼 매핑** — coins_catalog로 우선 해소 → 정적 `coingecko_ids` fallback. 같은 심볼이 여러 코인에 있으면 `market_cap_rank` 최저(=상위) 1개 자동 채택.
> - **워커 동적 모드** — POLL_SYMBOLS 환경변수 비어있으면 portfolio_holdings에서 unique symbol 조회. backward 호환 유지.

- [x] `worker/migrations/0006_coins_catalog.sql` — coingecko_id PK + 인덱스 4종(rank/symbol+rank/lower(symbol)/lower(name)) + RLS 2정책
- [x] `worker/coins_catalog_poller.py` — pass1/pass2 구조, CATALOG_TOTAL/PER_PAGE/PAGE_SLEEP/RETRY_COOLDOWN env
- [x] `worker/symbol_resolver.py` — fetch_active_symbols + resolve_via_catalog (rank 최저 자동 선택)
- [x] `.github/workflows/coins-catalog.yml` — cron `0 2 * * *` + workflow_dispatch total input
- [x] price/candle/indicators 워커 — POLL_SYMBOLS 비어있으면 동적 모드. 카탈로그 우선 → 정적 fallback. price chunk_size + candle symbol_sleep 옵션 추가
- [x] price-poll/candle-poll/indicators .yml — POLL_SYMBOLS 환경변수 제거 (동적 모드 기본)
- [x] `frontend/src/lib/coins.ts` — fetchTopCoins / searchCoins (ilike symbol or name, rank 정렬 limit 30)
- [x] `HoldingForm.tsx` — 자동완성 datalist + 200ms 디바운스
- [x] AppShell 경고 문구 갱신 — 동적 모드 시대에 맞게
- [x] **검증 (2026-05-18)** — coins-catalog 워크플로 5000/5000 적재 (pass1 4250 + pass2 750, 7m13s). FET 추가 후 price/candle/indicators 모두 동적 모드 정상: active_symbols=['BTC','ETH','FET','SOL'], 4건/364행/374행 적재.

---

## Stage 2-E 차트 fix (2026-05-18)

- [x] ChartModal line 시리즈 — UTCTimestamp + ts 기준 dedup으로 BusinessDay 키 중복 문제 해결 (FET 빈 그리드 → line 표시)
- [x] fmt 가변 정밀도 — |v|에 따라 toFixed 2/3/4/6. FET MACD -0.0048이 "-0.00"으로 표시되던 문제 해결

---

## Stage 4 · LLM 기반 뉴스 감성·이벤트 분류 ★ 진행 중 (코드 완료, cron 자동 백필)

> 설계 결정 (2026-05-18)
> - **공급자** — Anthropic 결제 등록 부담으로 Google Gemini 무료 tier 채택. 모델 `gemini-2.5-flash-lite`.
> - **thinking_budget=0** — 2.5 시리즈는 thinking 모델이라 max_output_tokens가 내부 추론에 소진. 비활성화로 응답 텍스트 확보.
> - **RPD 20 한도** — 무료 tier 일별 한도 20건 확인. 매시간 cron이 일 ~20건 점진 처리(약 4일에 102건 백필 완료).
> - **fatal vs transient** — PerDay quota·인증·권한·지원 안 됨 지역만 영구 abort. PerMinute quota는 응답의 retryDelay 추출해 정확히 대기.
> - **감성 3-class + event 6-class** — positive/neutral/negative × listing/regulation/hack/partnership/tech/general.
> - **가격 예측 금지 명시** — 프롬프트와 UI 면책에 통계 표시 전용 명시.

- [x] LLM 호출 래퍼 — `worker/news_classifier.py` (google-genai SDK, response_mime_type=json, temperature 0.2, thinking_budget=0)
- [x] 프롬프트 설계 — 한국어 가이드 포함, 매매 신호 해석 금지 명시
- [x] 데이터 모델 — `worker/migrations/0007_news_classifications.sql` (news_id PK FK, CHECK 제약, 인덱스 2종, RLS 2정책)
- [x] 차집합 미분류 조회 — fetch_pending_news (news_classifications에 없는 news 최신순)
- [x] rate limit·영구 오류 분리 — _is_fatal/_extract_retry_delay
- [x] GitHub Actions — `.github/workflows/news-classify.yml` (cron `15 * * * *` + batch input)
- [x] 프론트 배지·태그 — `lib/news.ts` 임베딩 + `NewsFeed.tsx` sentiment 색상 배지 + category 한국어 태그
- [x] **검증 (2026-05-18)** — 약 34건 적재 (positive/neutral/negative + tech/regulation/general/hack/partnership/listing 모두 등장). Gemini RPD 20 한도 안에서 cron 자동 백필.
- [ ] 102건 전체 완료 대기 — cron 매시간 :15 UTC 약 4일 소요
- [ ] prod URL 시각 검증 — NewsFeed 배지/태그 표시

---

## 변경 push (사용자 실행 완료, 본 세션 #3 내 발생)

> 직전 세션 #2 까지의 누적 21파일(14 modified + 7 untracked) 변경을 본 세션 #3 안내 직후 사용자가 가이드 그대로 5 commit + push 실행 완료. Vercel webhook 자동 발화.

### 적용된 5 commit (origin/main 반영 확인)
- [x] `e38895b feat(frontend): Coinbase 디자인 토큰 전면 적용` (8 파일)
- [x] `bc09ef1 feat(frontend/news): 카드 캐러셀 + 한글 번역 (MyMemory)` (3 파일)
- [x] `9f53e1c feat(frontend/chart): v5 paneIndex multi-pane RSI/MACD` (1 파일)
- [x] `fdecd96 feat(stage2.5): peak_signals 14 지표 워커 + 표 UI` (6 파일)
- [x] `8940c3d docs: Stage 2.5 진행률 14/23 + 운영 안정화 반영` (3 파일)
- [x] `git push origin main` — `Your branch is up to date with 'origin/main'` 확인

### 2026-05-19 추가 배포/검증 완료
- [x] `bfef5e2 feat(stage2.5): add ETF flow peak signals` — Farside ETF flow 2 지표 + UI 메타데이터 + 문서 갱신
- [x] `11b1c82 fix(frontend): keep peak signal badges on one line` — `미명중` 배지 줄바꿈 수정
- [x] `gh workflow run peak-signals.yml` — run `26081203527`, conclusion success
- [x] Supabase 최신 `captured_at=2026-05-19T00:00:00+00:00` 기준 16행 확인
- [x] Vercel Production deployment success + 운영 URL HTTP/2 200 확인

### 시각 검증 (시크릿창 권장, 캐시 회피)
- [x] `https://crypto-monitoring-one.vercel.app/` 운영 URL 응답 정상
- [x] 폰트 — 본문 Inter, 숫자 JetBrains Mono
- [x] CTA — Coinbase Blue `#0052ff` pill (radius 100px)
- [x] 카드 — 흰 배경 + 1px hairline + 24px radius
- [x] 뉴스 — 카드 캐러셀 + ←/→ + 한국어 제목 (영문 작은 회색 이탤릭)
- [x] 차트 모달 — 가격/RSI(30·70 점선)/MACD(line+Signal+Histogram) 3단 세로
- [x] PeakSignals 표 — 16행, `미명중`/`대기` 배지 한 줄 표시, 14 ok + 2 insufficient_data

### 트러블슈팅
- Vercel 빌드 실패 — `Deployments` 행 클릭 → `View Build Logs`로 에러 확인. 로컬 `npm run build` 통과 후 push했으면 거의 안 생김.
- 폰트 미적용 — DevTools Network에서 `fonts.googleapis.com` 차단 여부 확인
- PeakSignals 빈 표 — `gh workflow run peak-signals.yml` 발화 후 1분 기다리거나 Supabase `select count(*) from peak_signals;` 0이면 워커 미발화
- 번역 안 보임 — MyMemory 일 5천 단어/IP 한도 초과. 다음 날 자동 복구. localStorage 캐시는 살아있음.

---

## Stage 5 · 실시간화

- [ ] Railway 워커에서 거래소 WebSocket 구독
- [ ] Supabase Realtime을 통한 프론트 푸시 또는 별도 채널
- [ ] 프론트 실시간 가격 위젯
- [ ] 연결 끊김·재연결 처리
- [ ] 부하 테스트 (다중 사용자 시나리오)

---

## 디자인 시스템 · Coinbase 적용 ✓ 완료 (2026-05-18 후속)

> 설계 결정 (2026-05-18 후속)
> - **출처** — `npx getdesign@latest add coinbase` CLI가 생성한 `frontend/DESIGN.md` 토큰 사양서. 라이선스 폰트는 Inter / JetBrains Mono로 대체.
> - **voltage** — Coinbase Blue `#0052ff` 하나만. 모든 primary CTA / 브랜드 wordmark / 강조 링크에만 사용.
> - **geometry** — pill 100px(액션 버튼·탭·배지) / xl 24px(카드) / full 9999px(아이콘) / md 12px(input). sharp 0px 금지.
> - **rhythm** — 흰 캔버스 + soft gray(#f7f7f7) 부드러운 표면 + hairline(#dee1e6) 1px 디바이더. 단일 shadow tier.
> - **trading semantics** — up `#05b169` / down `#cf202f`은 텍스트 컬러로만. 배경 fill 금지.

- [x] `frontend/DESIGN.md` 생성 (getdesign add coinbase) — YAML 토큰 + 컴포넌트 사양 + Do/Don't
- [x] `frontend/index.html` — Inter + JetBrains Mono Google Fonts preconnect + display=swap
- [x] `frontend/src/index.css` — 다크 토큰 전부 → Coinbase 토큰(colors / radius / spacing / fontFamily). #root 강제 width 1126px 제거 → 100vh white canvas
- [x] `Login.tsx` — 420px 화이트 카드 + 36px h1 + Coinbase Blue pill CTA. 다크 보더 일소
- [x] `AppShell.tsx` — 64px sticky top-nav + 파란 brand wordmark + Fear & Greed pill 배지 + 흰 SummaryBox 24px radius(컬럼 hairline 분리)
- [x] `HoldingForm.tsx` — 32px padding 흰 카드 + 44px hairline input + 파란 pill "추가" CTA + pill "새로고침"
- [x] `HoldingsList.tsx` — 흰 카드 + 32px 원형 asset-icon(symbol 첫 글자) + uppercase 컬럼 헤더 + mono 가격 + pill 3종 액션(primary/secondary/outline-danger)
- [x] `NewsFeed.tsx` — 흰 카드 + segmented control pill 탭(active = ink #0a0b0d) + pill 감성 배지(라이트 톤) + pill 카테고리 태그
- [x] `ChartModal.tsx` — 흰 모달 24px radius + #0052ff 라인 + #eef0f3 그리드 + asset-icon 헤더 + 5 Stat 카드(#f7f7f7 12px)
- [x] `App.tsx` — 로딩 상태도 흰 캔버스로 통일

---

## NewsFeed 진화 · 카드 캐러셀 + 한글 번역 ✓ 완료 (2026-05-18 후속)

> 설계 결정 (2026-05-18 후속)
> - **표시 방식** — 사용자 명시 "한 건씩 넘겨서 보기". 단일 리스트 → 카드 캐러셀.
> - **그룹화** — 사용자 명시 "기존 카테고리별". 4 그룹(감성/카테고리/종목/시간순) × 2 필터(보유/전체) 분리.
> - **번역 출처** — MyMemory API(키 불필요, 무료 일 5천 단어). 워커 LLM 분류와 quota 충돌 회피.
> - **캐싱** — localStorage 영구. 동일 헤드라인은 1회만 호출.

- [x] `lib/news.ts` — `NewsItem.symbols: string[]` 추가 + select에 `news_ticker_map(symbol)` 임베딩
- [x] `NewsFeed.tsx` 1단계 — 단일 리스트 → 4 그룹 섹션(감성 ●●● + 카테고리 6 + 종목 N + 시간순) 적층
- [x] `NewsFeed.tsx` 2단계 — 섹션 모두 노출 → 카드 캐러셀(chip 점프 + ←/→ 순환 wrap + N/M 카운터)
- [x] `lib/translate.ts` — MyMemory API + localStorage `tr:en-ko:v1:` 접두사 + in-flight Map dedup + 원문 echo 캐시 차단
- [x] `NewsFeed.tsx` 3단계 — 현재 카드 + 인접 4건 prefetch. 캐시 hydration. 한글 메인 + 영문 작은 회색 이탤릭 보조. pending 시 "번역 중…" pill
- [x] 섹션 chip — 라벨 + 카운트 배지 + 색상 dot (감성 그룹 시 긍정 녹/중립 회/부정 적)
- [x] 빌드 검증 — 594KB / gzip 175.6KB

---

## Stage 2.5 · 강세장 정점 신호 — 1차 구현 (키 불필요 3 지표) ✓ (2026-05-18 후속)

> 설계 결정 (2026-05-18 후속)
> - **우선순위** — 사용자 액션(CMC key) 없이 즉시 가능한 영역부터. CoinGecko `/global` + BTC candles 자체 계산만으로 인프라 + 첫 적재 검증.
> - **status 컬럼** — 데이터 부족(< 200d/350d)은 `insufficient_data`로 행 적재. skip 대신 운영 가시성 확보.
> - **threshold 정의** — Mayer ≥ 2.4 / Pi Cycle ≥ 1.0 (역사적 사이클 top). BTC 도미넌스는 임계 없이 표시만.

- [x] `worker/migrations/0008_peak_signals.sql` — signal_key / value / threshold / hit / progress_pct / source / status / note / captured_at. UNIQUE(signal_key, captured_at) + CHECK(status), 인덱스 2종, RLS 2정책
- [x] **사용자 액션** — Supabase SQL Editor에서 0008 실행 완료
- [x] `worker/peak_signals_poller.py` — 3 지표 계산기 (compute_btc_dominance / compute_mayer_multiple / compute_pi_cycle_top), insufficient_data·error 폴백
- [x] `.github/workflows/peak-signals.yml` — cron `30 2 * * *` + workflow_dispatch
- [x] `frontend/src/lib/peakSignals.ts` — fetchLatestPeakSignals (signal_key별 최신 1행 클라이언트 grouping) + SIGNAL_META 라벨/설명
- [x] `frontend/src/components/PeakSignals.tsx` — 표 UI (헤더 명중/평균 진행률 + 컬럼 # · 지표 · 현재값 · 기준값 · 명중 배지 · 진행률 막대 · source + 면책)
- [x] AppShell — 포트폴리오 ↔ PeakSignals ↔ 뉴스 순서
- [x] **BTC 캔들 365일 백필** — `gh workflow run candle-poll.yml -f days=365` 실행 → 371행 (2025-05-19 ~ 2026-05-18)
- [x] **로컬 첫 적재 검증** — 3 지표 모두 status=ok. btc_dominance 58.19% / mayer_multiple 0.9538 (hit=False, 39.74%) / pi_cycle_top 0.3832 (hit=False, 38.32%)
- [x] **GitHub Actions workflow_dispatch 검증** — run `26081203527` success, 최신 16행 적재 확인
- [ ] **자동 진행 — peak-signals cron 매일 02:30 UTC 발화 관측**

### 2.5-B1 자체계산 확장 ✓ 완료 (2026-05-18 후속)

> 7개 지표로 확장. 모든 계산은 worker에서 CoinGecko + BTC candles만으로 처리(외부 키 0).

- [x] **btc_dominance** — threshold=70% 추가 (단일 voltage 명중 판정). 코드 1줄
- [x] **btc_rsi_22** — BTC 일봉 22일 RSI (peak_signals_poller.py 신규 함수). threshold 70 과매수
- [x] **ahr999** — `(price/200d_geomean) × (price/regression_price)`. regression = `10^(5.84 × log10(age_days) - 17.01)`. threshold 1.2 매도 영역
- [x] **rainbow_band** — log 회귀 baseline 기준 8 band 인덱스 (0-7). threshold ≥6 Bubble territory. AHR999와 동일 회귀식 사용
- [x] **two_year_ma_multiple** — `price / 2y SMA`. threshold 5. 730일 누적 필요 — 현재 371일이라 `insufficient_data` 적재 (skeleton 활성, candle-poll 누적 시 자동 활성화)
- [x] `lib/peakSignals.ts` — `SIGNAL_META` 4종 추가 + `unit` 필드(%/band/무차원) + `DISPLAY_ORDER` 7개로 확장
- [x] `PeakSignals.tsx` — `formatValue()` 헬퍼로 단위별 표시 분기 (% 접미사 / `N / 7` band / 가변 정밀도)
- [x] **로컬 워커 검증** — 7개 행 모두 적재. rainbow_band 회귀 계수 보정(blocks → days, 5.84/-17.01) 후 결과: dominance 58.21%(83.15%) / mayer 0.9538 / pi 0.3832 / rsi22 46.16 / ahr999 0.4715 / rainbow band 2 / 2y MA insufficient

### 2.5-D 무료 온체인 ✓ 완료 (2026-05-18 후속)

> bitcoin-data.com 무료 API (키 불필요, 응답 단순). 모든 호출은 `https://bitcoin-data.com/api/v1/{endpoint}/last`. 응답 — `{ d: 'YYYY-MM-DD', unixTs, <key>: float }`.

- [x] `fetch_bitcoin_data()` 공통 헬퍼 — 429/HTTPError 백오프 + 응답 키 누락 방어
- [x] `compute_onchain_indicator()` 공통 계산기 — 4 지표가 동일 구조라 1 함수로 통합
- [x] **puell_multiple** — `/api/v1/puell-multiple/last` (key=`puellMultiple`). threshold 4.0. 일일 채굴 발행량 × 가격 / 365d 평균
- [x] **mvrv_z_score** — `/api/v1/mvrv-zscore/last` (key=`mvrvZscore`). threshold 7.0. (mcap − Realized Cap) / 표준편차
- [x] **nupl** — `/api/v1/nupl/last` (key=`nupl`). threshold 0.75. Net Unrealized Profit/Loss
- [x] **mvrv_ratio** — `/api/v1/mvrv/last` (key=`mvrv`). threshold 3.7. mcap / Realized Cap
- [x] `lib/peakSignals.ts` SIGNAL_META 4종 추가 + DISPLAY_ORDER 11개로 확장. note에 `data_date`(원 API 일자) 기록
- [x] **로컬 워커 검증 (2026-05-18 03:55 UTC)** — 11 행 적재. 4 온체인 결과:
  - puell_multiple 0.7923 (19.81% / hit False) — 데이터 2026-05-17
  - mvrv_z_score 0.8177 (11.68% / hit False)
  - nupl 0.3087 (41.16% / hit False)
  - mvrv_ratio 1.4465 (39.09% / hit False)
- [x] 빌드 통과 — 610KB / gzip 179KB

### 2.5-C 합법 무료 — Strategy(MSTR) BTC 보유 ✓ 완료 (2026-05-18 후속)

> 설계 결정 — SEC EDGAR 8-K 직접 파싱은 비매입 공시(컨버터블 노트 환매 등)와 매입 공시가 섞여 있어 정형 파싱 안정성 낮음. CoinGecko의 무료 `/companies/public_treasury/bitcoin` endpoint가 Strategy 포함 BTC 보유 상장사 데이터를 직접 제공하므로 채택.

- [x] `fetch_treasury()` — CoinGecko `/companies/public_treasury/bitcoin` (키 불필요, 429 백오프 + 응답 방어)
- [x] `_find_strategy()` — name=`Strategy` 또는 `MicroStrategy` 매칭 (2025 rebrand 대응)
- [x] **mstr_btc_holdings** — Strategy의 BTC 보유 수량. 정보성 (threshold 없음). note에 `pct_of_supply` 기록
- [x] **mstr_pnl_ratio** — `total_current_value_usd / total_entry_value_usd`. threshold 2.0 (2021/2024 사이클 top ratio ~2.4-2.5). note에 holdings/entry/current/avg_cost 기록
- [x] `lib/peakSignals.ts` SIGNAL_META 2종 추가 + `unit: 'BTC'` 타입 확장 + DISPLAY_ORDER 13개로 확장
- [x] `PeakSignals.tsx` `formatValue()` — `unit='BTC'` 분기 추가 (`818,869 BTC` 콤마 포맷)
- [x] **로컬 워커 검증 (2026-05-18)** — Strategy 818,869 BTC (전체 공급 3.899%) / PnL ratio 1.0193 (50.96% / hit False, BTC ~$76k가 MSTR 평균 매입가 ~$75.5k와 거의 동등)

### 2.5-C ETF flow — CoinGlass Hobbyist 도입 결정 (2026-05-18 후속)

> 사용자 결정 — CoinGlass Hobbyist tier($29/월) 도입으로 ETF flow + 기타 정점 지표 확장. 코드 작업은 사용자 키 발급 + endpoint 확인 후 진행.

#### 사용자 액션 (4단계)
- [ ] **① CoinGlass 가입** — https://www.coinglass.com/ 우측 상단 Sign Up. 이메일 인증.
- [ ] **② Hobbyist plan 결제** — https://www.coinglass.com/pricing 에서 **Hobbyist $29/월** 선택. 카드 결제 또는 USDT.
- [ ] **③ API key 발급** — https://www.coinglass.com/api/account 또는 `Profile → API`에서 `Create Key`. 키 본문은 채팅에 절대 노출 금지.
- [ ] **④ 키 저장 (2곳)**:
  - 로컬 검증용 — `worker/.env`에 `COINGLASS_API_KEY=<발급값>` 추가
  - GitHub Actions cron용 — `gh secret set COINGLASS_API_KEY` 또는 GitHub UI `Settings → Secrets and variables → Actions → New repository secret`

#### 워커·UI 인프라 (사용자 액션 이전에 가능한 준비)
- [x] `worker/.env.example` — `COINGLASS_API_KEY=` placeholder + 가입 안내
- [x] `.github/workflows/peak-signals.yml` — `COINGLASS_API_KEY: ${{ secrets.COINGLASS_API_KEY }}` env 주입
- [ ] **사용자 키 발급 신호 후** — endpoint 확인 + `compute_etf_flow()` 등 추가
  - ETF flow daily net (BTC ETF 일별 순유입/순유출 USD)
  - ETF cumulative holdings (총 BTC 보유량)
  - 가능하면 fund-level breakdown (IBIT, FBTC, GBTC 등)

### 다음 우선순위 (2.5 확장)
- [ ] **2.5-B0 CMC 공식 API** — 사용자 액션: CoinMarketCap Pro Basic key 발급 (Altcoin Season Index 우선)
- [ ] Bull Market Support Band (20wSMA + 21wEMA) — 정점 신호 관점에선 부적합. 별도 "사이클 phase" 섹션으로 분리 검토
