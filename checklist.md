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
- [x] RLS(Row Level Security) 정책 — 본인 데이터만 접근 가능하도록 설정
- [x] 마이그레이션 SQL을 `worker/migrations/` 또는 Supabase migrations에 저장 — `worker/migrations/0001_init.sql`
- [x] Supabase SQL Editor에서 `0001_init.sql` 실행 → 테이블·정책 생성 확인 (holdings 4 RLS policies, snapshots 1 RLS policy)

### 1-B. 워커 — 시세 폴링 ★ 진행 중 (배포만 남음)
- [x] 거래소 시세 API 선택 — CoinGecko `/simple/price` (키 불필요)
- [x] `worker/price_poller.py` 작성 — N초 간격으로 가격 조회 후 `price_snapshots`에 적재
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
- [x] 가격 자동 갱신 — 30초 polling (Realtime은 Stage 5)

### 1-D. 검증
- [x] 보유 자산 1건 등록 → 평가금액이 가격 변동에 따라 갱신되는지 확인 (워커 무한 폴링 + 30초 프론트 폴링) — 2026-05-16
- [x] 다른 사용자가 내 데이터를 조회할 수 없는지 RLS 검증 — 2026-05-16 (woojinchang0728@gmail.com / becks0728@naver.com 두 계정 격리 확인. DB에는 두 행 모두 존재, 프론트에서는 각자 본인 행만 표시)
- [x] 프론트 번들에 API 키가 포함되지 않는지 빌드 산출물 재검사 — `sb_publishable` 1, `sb_secret`/`service_role` 0, service_role 본문 텍스트 0
- [x] Vercel + Supabase end-to-end 동작 확인 — 2026-05-16 (Vercel `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` Production/Preview 등록, Supabase URL Configuration에 prod 도메인 redirect 추가, prod에서 매직링크 로그인·요약·목록·평가금액 모두 정상)
- [x] (Railway 보류 항목) 워커 long-running 호스팅 결정 — **GitHub Actions cron (5분 간격)** 선택. 비용 0, 무료 한도 충분. `.github/workflows/price-poll.yml` 작성. POLL_ONCE 모드로 5분마다 1회 실행.
  - [ ] GitHub Repository Secrets에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록 (사용자 액션)
  - [ ] workflow_dispatch로 1회 수동 실행 → Supabase price_snapshots 적재 확인
  - [ ] cron 자동 실행 정상 동작 확인 (5분 이내 첫 실행)

---

## Stage 2 · 캔들 수집 + 기술적 지표 + 공포·탐욕 지수

- [ ] 캔들 데이터 테이블 설계 (timeframe별)
- [ ] 워커에서 OHLCV 수집 잡 구현
- [ ] RSI 계산 모듈 (Python, worker)
- [ ] MACD 계산 모듈 (Python, worker)
- [ ] 공포·탐욕 지수 API 연동 및 적재 (Alternative.me, 무료)
- [ ] 프론트 차트 컴포넌트 (예: lightweight-charts)
- [ ] 지표 오버레이 UI

---

## Stage 2.5 · 강세장 정점 신호 (Bull Market Peak Signals) — 백로그

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

### 2.5-A. 인프라
- [ ] **사용자 액션** — CoinMarketCap Pro API key 발급 (Basic 무료 plan: 30 req/min, 10,000 credits/월)
- [ ] `worker/.env`에 `CMC_API_KEY` 추가 + `.env.example` 갱신
- [ ] `peak_signals` 테이블 설계 (id, signal_key, value_numeric, threshold, hit boolean, captured_at, source enum: 'cmc'/'coingecko'/'computed')
- [ ] 워커 일일 수집 잡 — 각 지표 1회/일 적재
- [ ] 프론트 — 지표 표 (현재값/기준값/명중여부/거리/Progress) + 평균 진행률 헤더

### 2.5-B0. CMC 공식 API 사용 (출처 우선)
- [ ] **알트코인 시즌 지수 (Altcoin Season Index)** — `GET /v1/altcoin-season-index/latest` 및 `/historical` (7d/30d/90d). 0-100 스케일, ≥75 알트시즌·≤25 비트코인 시즌. 15분 캐시·1 credit/call.
- [ ] **공포·탐욕 지수 (Fear & Greed Index)** — `GET /v1/fear-and-greed/latest` (CMC). 대안: alternative.me 무료 API.
- [ ] **★ CMC 'crypto-market-cycle-indicators' 페이지 지표 API 존재 여부 확인** — Pi Cycle Top / Puell Multiple / Rainbow Chart 등이 CMC API에서 별도 엔드포인트로 제공되는지 미확인. 화면용 위젯뿐일 가능성 ★. 확인 안 되면 아래 2.5-B1 자체 계산으로 폴백.

### 2.5-B1. CoinGecko 가격으로 자체 계산 (CMC API에 없을 때 폴백·또는 무료 유지)
- [ ] **AHR999 지수** — `BTC / 200d_geomean_MA × growth_factor` (대략).
- [ ] **AHR999x 고점 회피** — AHR999 변형.
- [ ] **Pi Cycle Top** — `111dMA` vs `350dMA × 2` 교차.
- [ ] **2년 MA 배수** — `price / 2yMA`.
- [ ] **4년(1460d) 이동평균선** — `price / 1460dMA` *(CoinGecko 무료 365일 한도 → 워커가 매일 종가 적재 후 누적 5년치 직접 보유 필요)*.
- [ ] **Mayer Multiple** — `price / 200dMA`.
- [ ] **레인보우 차트** — 로그 회귀 밴드 (오픈소스 회귀식 사용).
- [ ] **RSI 22일** — 일봉 종가 기반 RSI 계산.
- [ ] **비트코인 도미넌스** — CoinGecko `/global` API 직접.
- [ ] **골든 레이쇼 멀티플라이어** — `price / 350dMA × ratio`.
- [ ] **CBBI** — 여러 하위 지표 가중평균 (자체 정의 필요).
- [ ] **Smithson의 예측** — 175k~230k 범위 비교 (단순 임계값).
- [ ] **비트코인 트렌드 지표** — 정의 불명확. 정의 확정 후 구현.

### 2.5-C. 무료 외부 페이지에서 스크랩/수집 가능
- [ ] **ETF 순유출 일수** — Farside/SoSoValue 공개 페이지. 일일 ETF flow CSV.
- [ ] **ETF/BTC 비율** — 누적 ETF 보유 BTC / 총 공급량. Farside 데이터로 계산.
- [ ] **MicroStrategy 평균 매입 단가** — Saylortracker 또는 공시 데이터.
- [ ] **USDT 플렉서블 세이빙** — Binance Earn 공개 페이지 (스크랩 안정성 ★ 낮음).

### 2.5-D. 온체인 데이터 필요 — 무료 한도 안에서 가능한 것만 (보류 가능성 ★)
> 무료 대안 후보 — `mempool.space` (UTXO 통계), `Blockchain.com Charts`, `CoinMetrics community` (일부 무료), `bitcoin-data.com` API.
- [ ] **Puell Multiple** — 일일 발행량 × 가격 / 365d 평균. `bitcoin-data.com` 또는 `mempool.space` + CoinGecko 조합 가능.
- [ ] **MVRV Z-Score** — Market cap vs Realized cap. `bitcoin-data.com` 무료 가능.
- [ ] **NUPL (미실현 손익)** — Realized cap 필요. `bitcoin-data.com` 가능.
- [ ] **RHODL 비율** — Glassnode 의존. 무료 대안 부재. **보류**.
- [ ] **Reserve Risk** — Glassnode 의존. **보류**.
- [ ] **MVRV 비율** — `bitcoin-data.com` 가능.
- [ ] **LTH Supply / STH Supply%** — Glassnode 의존. **보류**.
- [ ] **Bitcoin Macro Oscillator (BMO)** — Glassnode 의존. **보류**.
- [ ] **Bitcoin Terminal Price** — Glassnode 의존. **보류**.
- [ ] **비트코인 버블 지수** — 정의 불명확. **보류**.
- [ ] **3개월 연환산 비율** — 정의 불명확. **보류**.
- [ ] **CBBI** (재게재) — 위 자체계산 항목과 통합.

### 2.5-E. UI / 결과 검증
- [ ] 프론트 표 UI (스크린샷 레이아웃 참고: # / 지표 / 현재 / 기준값 / 명중 여부 / Distance to Hit / Progress)
- [ ] 명중률 헤더 (예: "명중: X/30, 평균 진행률 Y%")
- [ ] "매도 신호 아님 — 통계 표시 전용" 면책 문구
- [ ] 과거 데이터 차트 (소형 sparkline 또는 상세 모달)

> 예상 구현 가능 범위 — CMC API(2.5-B0) 2-3개 + 자체 계산(2.5-B1) 13개 + 외부 페이지(2.5-C) 4개 + 온체인 무료(2.5-D 일부) 1-3개 = **약 20-23개 / 30개**. 나머지는 N/A 표시.

---

## Stage 3 · 뉴스 수집 + 티커 매핑

- [ ] CryptoPanic API 클라이언트 (worker)
- [ ] RSS 피드 파서 (worker)
- [ ] 뉴스 저장 테이블 설계 (id, source, title, url, published_at, raw_content)
- [ ] 본문에서 티커 추출 → 매핑 테이블 (`news_ticker_map`)
- [ ] 중복 뉴스 제거 (URL 또는 콘텐츠 해시)
- [ ] 프론트 뉴스 피드 UI — 보유 종목 필터링

---

## Stage 4 · LLM 기반 뉴스 감성·이벤트 분류

- [ ] LLM 호출 래퍼 (worker, 키는 환경변수)
- [ ] 프롬프트 설계 — 감성(긍정/중립/부정), 이벤트 카테고리(상장·규제·해킹 등)
- [ ] 분류 결과 저장 컬럼 추가
- [ ] 일괄 분류 백필 잡
- [ ] 분류 결과 캐시 (동일 뉴스 재호출 방지)
- [ ] 프론트 — 감성 배지·이벤트 태그 표시
- [ ] **명시: 가격 예측 기능은 만들지 않는다. 감성·통계 표시까지만.**

---

## Stage 5 · 실시간화

- [ ] Railway 워커에서 거래소 WebSocket 구독
- [ ] Supabase Realtime을 통한 프론트 푸시 또는 별도 채널
- [ ] 프론트 실시간 가격 위젯
- [ ] 연결 끊김·재연결 처리
- [ ] 부하 테스트 (다중 사용자 시나리오)
