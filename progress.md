# progress.md — crypto-monitoring

세션 종료 시 본 파일을 갱신한다. 다음 세션은 이 파일을 먼저 읽고 작업을 이어간다.

---

## 현재 상태 (2026-05-18 KST 추가, 본 세션 누적 commit 9건)
**Stage 3 적재 검증 완료 + coins_catalog 5000위 도입 + 워커 동적 모드 + ChartModal 렌더링 fix.** 본 세션 핵심 — (1) Stage 3 news-poll 워크플로 검증 통과 (102 entries, 69 ticker_links), (2) coins_catalog 테이블 + 폴러 + 시총 5000개 적재 (pass1/2 구조로 rate limit 대응), (3) price/candle/indicators 폴러가 POLL_SYMBOLS 비어있으면 portfolio_holdings 기반 동적 모드, (4) HoldingForm 심볼 자동완성 datalist, (5) FET 4번째 심볼로 추가하고 4 워크플로 모두 동적 매핑 검증, (6) ChartModal line 시리즈가 BusinessDay key 중복으로 안 그려지던 문제를 UTCTimestamp+dedup으로 해결 + 작은 MACD 값 표시 정밀도 가변. 다음 분기점: Stage 4(LLM 감성, key 필요) 또는 Stage 2.5(강세장 정점, CMC key 필요).

| 영역 | 상태 | 비고 |
|---|---|---|
| 로컬 스캐폴드 | ✓ | frontend (Vite+TS) / worker (Python 3.11) |
| GitHub | ✓ | `becks0724/becks0724-04.ai_agent` (**public**, main). 2FA + Passkey 활성 |
| Supabase | ✓ | Singapore region. 테이블 8종 (portfolio_holdings, price_snapshots, candles, fear_greed, indicators, news, news_ticker_map, **coins_catalog**) |
| Vercel | ✓ | `https://crypto-monitoring-one.vercel.app`, end-to-end 통과. AuthContext + 공포·탐욕 + NewsFeed + HoldingForm 자동완성 |
| 워커 호스팅 | ✓ | GitHub Actions 6 워크플로 (price-poll 15분, fear-greed 01:00, candle-poll 01:15, indicators 01:30, news-poll 매시간 :05, coins-catalog 02:00). 모든 workflow_dispatch 성공. price/candle/indicators는 동적 모드 — POLL_SYMBOLS 미지정 시 portfolio_holdings에서 자동 |
| auth 리팩토링 | ✓ | AuthContext 도입, prop drilling 제거, signOut/error 노출, env throw |
| Stage 2-A~E | ✓ | candles/fear_greed/indicators + ChartModal (lightweight-charts v5.2, UTCTimestamp+dedup으로 line 안정화, 가변 정밀도 표시) |
| Stage 3 뉴스 | ✓ | RSS 4 sources + ticker_matcher + news/news_ticker_map. **검증 완료** — 102 entries / 69 ticker_links (coindesk 25/14, cointelegraph 30/25, bitcoinmagazine 10/10, decrypt 37/20) |
| coins_catalog 5000위 | ✓ | 0006 SQL + coins_catalog_poller (per_page 250 × 20 + pass1/2 rate limit 대응). 적재 5000/5000. price/candle/indicators가 catalog 우선 매핑 → 정적 fallback(15종) |
| HoldingForm 자동완성 | ✓ | datalist + 200ms 디바운스 검색 (symbol/name ilike, rank 정렬 상위 30) |
| FET 검증 사례 | ✓ | 사용자가 FET 보유 추가 → price 4건/candle 91×4=364행/indicators 374행(RSI 42.575/MACD -0.0048). 동적 매핑 모든 단계 통과 |

---

## 지금까지 한 일 (Stage 0)

### 인프라
- Git 저장소 초기화 + 루트 `.gitignore` (`.env*`, `node_modules`, `__pycache__`, `.venv` 등 차단)
- frontend Vite + React (TypeScript) 스캐폴드 + `npm run build` 통과
- worker Python 3.11 (`brew install python@3.11`) + `worker/.venv` + `python-dotenv 1.2.2`
- `python main.py` → `[worker] hello, world (env=local)` 로컬 검증
- GitHub `becks0724/04.ai_agent` 연결, 초기 커밋 `5e34478` push

### 외부 서비스
- Supabase 프로젝트 `becks0724's Project` (Singapore)
  - 보안 — Data API ✓, Auto-expose tables ☐ (수동 제어), Auto RLS ✓
- Vercel 프로젝트 (Root=`frontend`, Vite 자동 감지)
  - 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록
  - 첫 배포 `https://crypto-monitoring-one.vercel.app` Vite 화면 정상
  - 번들 보안 검색 — `sb_publishable` ≥1건(정상 주입), `sb_secret`·`service_role` 0건(누출 없음)

### 환경변수 분리 정책
- 새 키 시스템 — `sb_publishable_*` (frontend, public) / `sb_secret_*` (worker, secret)
- `.env.example` 두 파일은 placeholder만, 실제 값은 `.env.local`(frontend) / `.env`(worker)에만
- `CLAUDE.md` "환경변수 분리 정책" 섹션 명문화

---

## Stage 1 완료 요약 (2026-05-17)

### 1-A. 데이터 모델 ✓
- `worker/migrations/0001_init.sql` 작성·실행. `portfolio_holdings`(UNIQUE user_id+symbol, set_updated_at 트리거, RLS 4정책) + `price_snapshots`(symbol/fetched_at desc 인덱스, RLS authenticated select 전용, service_role write).

### 1-B. 워커 시세 폴러 ✓
- `worker/price_poller.py` (CoinGecko `/simple/price`), `worker/coingecko_ids.py` 15종 매핑. 환경변수 `POLL_INTERVAL_SECONDS`/`POLL_SYMBOLS`/`POLL_ONCE`. 지수 백오프, SIGINT graceful shutdown.

### 1-C. 프론트 포트폴리오 CRUD ✓
- `@supabase/supabase-js` + Magic Link Auth (`Login.tsx`) + `useAuth.ts` 세션 훅
- `HoldingForm`(KRW↔USD 양방향 환산, Frankfurter.dev→open.er-api 폴백) + `HoldingsList`(인라인 수정/삭제) + `SummaryBox`(총 평가금액/매수금액/손익 + KRW 부기)
- 30초 prices 폴링, 1초 tick "마지막 갱신" 카운터
- PostgrestError normalize 헬퍼(`lib/errors.ts`) — unique 위반 코드 23505 매칭

### 1-D. 검증 ✓
- 평가금액 가격 변동 갱신 — 워커 폴링 중 30초 주기 갱신 확인
- RLS 다중계정 — woojinchang0728@gmail.com vs becks0728@naver.com 격리 확인
- 번들 보안 — `sb_publishable` 1건, `sb_secret`/`service_role` 0건
- Vercel + Supabase end-to-end — prod URL Magic Link 로그인·CRUD·평가금액 모두 정상

### 1-E. 워커 호스팅 ✓
- **GitHub Actions cron** 선택 (15분 간격, 5분에서 조정). `.github/workflows/price-poll.yml`. POLL_ONCE 모드.
- 보안 조건 5/5 충족: 트래킹 파일·git history에 secret 키 본문 0건(검증 완료) → 안전 확인 후 repo public 전환으로 cron 발화 안정성·무료 한도 보강.
- 수동 실행 24s 완료, Supabase id 7-9 적재 확인.

---

## Stage 1 후속 — auth 리팩토링 ✓ (2026-05-17)

### 동기
session prop이 `App → AppShell`로, userId prop이 `AppShell → HoldingForm`으로 drilling. 깊은 자식이 세션을 쓰려면 prop 체인 확장 필요. 에러 상태 미노출(getSession 실패 silent). env vars 빈 문자열 fallback이 "검은 화면" 유발.

### 변경 파일 (7개, 커밋 `74ccac6`)
- `frontend/src/lib/useAuth.ts` → `useAuth.tsx` (리네임 + Context 패턴, `AuthProvider` + `useAuth` 훅. 반환값에 `user`, `error`, `signOut` 추가)
- `frontend/src/lib/supabase.ts` — env 미설정 시 throw (explicit failure)
- `frontend/src/main.tsx` — `<AuthProvider>` 래핑
- `frontend/src/App.tsx` — session prop 제거, error+세션없음 케이스 처리
- `frontend/src/components/AppShell.tsx` — session prop 제거, `useAuth()`/`signOut` 직접 호출
- `frontend/src/components/HoldingForm.tsx` — userId prop 제거, `useAuth().user.id` 직접 사용 + 세션 만료 가드

### 검증
- `npm run build` ✓ (407KB / gzip 115KB, Stage 1 종료 시점과 동일)
- 번들 보안 ✓ (`sb_publishable` 1, `sb_secret`/`service_role` 0)
- 로컬 dev (`localhost:5174`) — Login 렌더링, `useAuth must be used inside <AuthProvider>` 에러 없음, 에러 상태 노출 정상 (Supabase OTP rate limit 메시지 표시)
- 풀 시나리오(로그인→자산추가→로그아웃) 검증은 Supabase OTP rate limit으로 로컬에서 미완. Vercel 자동 배포 후 prod 기존 세션으로 검증 종결.

---

## Stage 2 완료 요약 (2026-05-17 ~ 2026-05-18)

### 2-A 데이터 모델
`worker/migrations/0002_candles.sql`. candles 테이블 (symbol, timeframe, open_time, OHLC, volume nullable), UNIQUE(symbol,timeframe,open_time), CHECK(timeframe ∈ 6개), RLS 2정책.

### 2-B 캔들 폴러
`worker/candle_poller.py` + `.github/workflows/candle-poll.yml` (매일 01:15 UTC + workflow_dispatch days input). CoinGecko `/coins/{id}/market_chart?interval=daily` (무료 plan ohlc는 일봉 미제공이라 close+volume만 사용. open/high/low=close). 90일 백필 273행 적재 확인.

### 2-C 공포·탐욕
`worker/migrations/0003_fear_greed.sql` + `worker/fear_greed_poller.py` + `.github/workflows/fear-greed.yml` (매일 01:00 UTC). Alternative.me 무료, captured_at upsert 멱등. value=31 Fear 적재 확인. 프론트 — `lib/fearGreed.ts` + AppShell 헤더 위젯 (분류별 색상, hover 시 기준일).

### 2-D RSI/MACD
`worker/migrations/0004_indicators.sql` + `worker/indicators.py` + `.github/workflows/indicators.yml` (매일 01:30 UTC). pandas로 RSI 14·MACD 12/26/9 계산. 279행 적재 (BTC RSI 35.80 / ETH 23.84 oversold / SOL 41.86). PostgrestAPIError 메시지 상세화 (code/message/details/hint 분리).

### 2-E 차트 모달
`frontend/src/lib/candles.ts` + `frontend/src/lib/indicatorsApi.ts` + `frontend/src/components/ChartModal.tsx`. lightweight-charts v5.2 line chart + 최신 RSI/MACD 텍스트 + ESC 닫기 + 면책 문구. HoldingsList "차트" 버튼으로 호출. 빌드 576KB / gzip 171KB, 번들 보안 통과.

---

## 다음 할 일 (다음 세션 시작 시)

### 본 작업 — Stage 4 (LLM 감성 분석) 또는 Stage 2.5 (강세장 정점 신호)
Stage 3 적재 + catalog 5000위 + FET 검증 완료 상태. 추천 흐름은 **Stage 4** (이미 news 테이블에 102건이 적재돼 있어 LLM 분류 백필이 자연스러움).

**Stage 4 진입 시 첫 작업**
- 사용자 액션 — Anthropic API key 발급 (Claude Haiku 4.5 추천: 비용 최저, 분류 충분)
- 데이터 모델: `worker/migrations/0007_news_classifications.sql` — sentiment(긍정/중립/부정), event_category(상장/규제/해킹/파트너십/일반), confidence, model_id, classified_at
- 워커: `worker/news_classifier.py` — 미분류 news 배치 처리, 프롬프트 구조 (제목+본문 50자 → JSON 응답)
- 백필 잡 + 신규 뉴스 trigger
- 프론트: NewsFeed 항목에 감성 배지 + 이벤트 태그

**Stage 2.5 진입 시 사전 액션**
- 사용자 — CMC Pro Basic API key 발급 (무료, 10k credits/월)
- 그 후: peak_signals 테이블, CMC Altcoin Season Index 어댑터, CoinGecko 자체 계산 18-23개

### 단기 잔여
- prod URL 시각 검증 — ChartModal FET line 표시 (`5383e69` 배포 후 확인)
- cron schedule 발화 모니터링 — 본 세션 5/17 04-05 UTC 1건씩 관측 후 추가 누적
- 빈 `becks0724/crypto-monitoring` 저장소 삭제 결정 (작업 영향 없음)

### 잔여 — cron schedule 발화
- price-poll.yml `*/15` 실제 발화 간격은 ~1시간 (자동 발화는 되나 빈도가 cron보다 낮음)
- 일 1회 워크플로 3건(fear-greed/candle/indicators)은 모두 schedule 1건씩 관측 (예약 시각 대비 ~3.5h 지연)
- GitHub Free best-effort 한계. 외부 cron(cron-job.org PAT) 또는 Fly.io 이전은 사용자 결정 보류

---

## 보류 항목
- ~~**Railway 배포**~~ — **종결**. GitHub Actions cron 채택으로 별도 long-running 호스팅 불필요. 향후 30초 폴링 등 더 빠른 주기 필요 시 재검토.
- **Stage 2.5 — 강세장 정점 신호 (Coinglass 30개 카탈로그 + CMC API 보강)** — checklist.md 백로그로 보존. 결정 갱신(2026-05-16): 출처는 **CMC 공식 API + CoinGecko 자체 계산 혼합** (Altcoin Season Index·Fear&Greed는 CMC API 우선, 나머지는 CoinGecko 종가 자체 계산). 페이지 스크래핑·유료 API 미도입. 구현 시점은 Stage 1·2 완료 후. 예상 가용 범위 20-23/30. **사용자 액션 — CMC Pro API key 발급(Basic 무료, 10k credits/월)**.

---

## 의사결정 로그

### 2026-05-18 (catalog 5000위 + 동적 모드 + ChartModal fix)
- **coins_catalog 도입 — symbol 동적 매핑** — Why: 사용자가 FET를 보유 추가했을 때 워커가 시세를 못 가져옴. 정적 `coingecko_ids.py` 15종 한계. CoinGecko `/coins/markets`로 시총 5000위 메타데이터를 일 1회 적재하고 portfolio_holdings에서 unique symbol 추출 후 catalog로 id 해소. 사용자가 자유롭게 추가해도 워커가 자동 따라감.
- **pass1/pass2 재시도 구조** — Why: CoinGecko 무료 plan에서 1.5초 page sleep으론 20페이지 중 8페이지가 429로 누락(첫 dispatch 3000/5000). page_sleep 4초 + 429 백오프 4/16/64s + pass1 후 누락 페이지만 60s cooldown 후 1회 재시도하면 5000/5000 완주(7m13s). CoinGecko 분당 호출 한도(~30)에 안전한 마진.
- **워커 동적 모드 — POLL_SYMBOLS 비어있으면 portfolio_holdings** — Why: price/candle/indicators 모두 .yml의 `POLL_SYMBOLS: BTC,ETH,SOL` 고정값이 동적 매핑을 막고 있었음. workflow env에서 변수 제거 → portfolio_holdings 동적 조회 → coins_catalog 우선 해소 → 정적 fallback(15종) 순. backward 호환 유지(POLL_SYMBOLS env 있으면 우선).
- **HoldingForm 자동완성 — HTML5 datalist** — Why: 5000위까지 지원하려면 텍스트 입력만으론 불편. datalist는 의존성 0이고 200ms 디바운스 검색으로 catalog ilike 매핑 충분. dropdown 라이브러리는 과잉.
- **ChartModal — UTCTimestamp + dedup으로 line 안정화** — Why: `slice(0,10)` 'YYYY-MM-DD' 키가 BusinessDay로 해석돼 동일 일자에 시각이 다른 candle(과거 dispatch + 백필 시각 불일치) 중복 시 시리즈가 invalid → FET 차트 빈 그리드만 표시. UTCTimestamp(초) + Map dedup으로 모든 row 별개 point. 추가로 fmt 가변 정밀도(|v|에 따라 toFixed 2/3/4/6)로 FET MACD -0.0048 같은 작은 값이 "-0.00"으로 보이지 않게.
- **price-poll/candle-poll/indicators .yml 환경변수 정리** — POLL_SYMBOLS 제거 + AppShell 경고 문구 "POLL_SYMBOLS 추가 필요" → "다음 사이클 자동 적재. catalog 미등록 심볼이면 비어있을 수 있음"으로 갱신.

### 2026-05-18 (Stage 3 코드 완료)
- **Stage 3 출처 — RSS 우선, CryptoPanic 보류** — Why: RSS 4종(CoinDesk/Cointelegraph/Bitcoin Magazine/Decrypt)은 키 불필요. CryptoPanic은 무료 키 발급이 필요해 사용자 액션 발생. RSS 적재 검증 후 CryptoPanic 어댑터를 옵션으로 추가하는 게 자연스러운 흐름.
- **티커 매칭 — 키워드 word-boundary, link/ton/dot 단독 제외** — Why: 단순 substring 매칭은 'link'(URL), 'ton'(무게), 'dot'(점) 등 일반어와 충돌. 풀네임(chainlink/toncoin/polkadot)만 매칭하면 false positive 차단. 1단계 키워드 17개 → 13 심볼. 미스 시 워커가 무해(매핑이 비어 적재만 됨).
- **중복 제거 — URL UNIQUE 만으로 충분** — Why: 동일 URL 재발행 빈도 낮음. 콘텐츠 해시(sha256(title))는 운영 중 중복 패턴 발견 시 추가. 현 단계는 단순성 우선.
- **NewsFeed UI — 보유/전체 탭, 5분 polling** — Why: 뉴스는 분 단위 갱신 불필요. 5분이면 RSS 폴러 주기(1시간)보다 자주라 UX 충분. 보유 종목 탭은 매칭된 뉴스가 없을 때 명시적 빈 상태 안내.
- **두 commit으로 분리** — Why: backend(SQL+워커+워크플로)와 frontend(피드 UI)는 의존 없음. backend는 사용자 SQL 실행 + workflow_dispatch로 독립 검증 가능. CLAUDE.md §11 "한 문장으로 설명 가능한 단위" 충족.

### 2026-05-18 (Stage 2 완료)
- **OHLCV 출처 — CoinGecko market_chart 채택, close 위주** — Why: CoinGecko 무료 plan의 `/coins/{id}/ohlc`는 days≥30에서 4일봉만 제공해 일봉 OHLC 미지원. `/coins/{id}/market_chart?interval=daily`는 prices(close)+total_volumes 제공. 진짜 일봉 OHLC가 필요해지면(Stage 2-D 차트 시각화 요구) Binance Klines 무료 API로 전환 옵션 보존. 현재는 open/high/low=close로 채워 NOT NULL 만족. RSI/MACD/Pi Cycle 등 close 기반 지표엔 영향 없음.
- **공포·탐욕 출처 — Alternative.me 무료 (CMC 폴백)** — Why: 사용자가 CMC Pro key 미발급 상태. Alternative.me는 키 불필요. 향후 CMC 키 발급 시 Stage 2.5 백로그에서 CMC API로 교체 가능.
- **차트 라이브러리 — lightweight-charts v5.2 채택** — Why: TradingView 제작, 캔들/라인/지표 모두 지원, 의존성 작음(170KB). 모달 방식 선택(라우터 의존성 미도입).
- **candle-poll에 workflow_dispatch days input 추가** — Why: schedule trigger는 매일 days=2면 충분(어제·오늘 UPSERT)하지만, 백필 시 1회 large pull 필요. inputs.days로 manual override 가능. fallback은 '2'.
- **RSI 14·MACD 12/26/9 — pandas 표준 EMA** — Why: 라이브러리 의존성 추가하지 않고 numpy/pandas만으로 계산. Wilder smoothing 대신 단순 rolling mean(많은 차트 도구의 디폴트와 일치).
- **PostgrestAPIError 메시지 상세화** — Why: 첫 PGRST205 디버깅 시 `e!r`(repr)이 잘려 "Error PGRST205:"만 출력됨. code/message/details/hint 분리 출력으로 schema cache vs 테이블 미존재 판별 가능.

### 2026-05-17 (auth 리팩토링 + Stage 2 진입)
- **auth 리팩토링 — AuthProvider Context 패턴** — Why: session/userId prop drilling 제거, 깊은 자식이 useAuth() 직접 호출, signOut/error hook 노출. env vars silent fail → explicit throw로 "검은 화면" 방지.
- **GitHub 저장소 리네임 — `04.ai_agent` → `becks0724-04.ai_agent`** — 사용자 측 GitHub UI 작업. 기존 URL은 자동 redirect로 호환. local remote URL은 그대로 두고 GitHub 리다이렉트 활용.

### 2026-05-16
- **워커 호스팅 — GitHub Actions cron 채택 (2026-05-17)** — Why: 비용 0, Public/private repo 무료 한도(2000분/월) 충분, 30초→5분 폴링이 MVP에 부족하지 않음, 기존 GitHub 인프라 외 추가 도입 없음. Railway 유료/Render/Fly 모두 후순위 후보로 남김. 보안 조건 5/5 충족(private repo + 2FA + Passkey + secrets-as-env + 공식 actions만).
- **cron 주기 5분 → 15분 (2026-05-17)** — Why: 무료 plan에서 5분 cron은 첫 발화 지연이 30분+로 누락·지연이 잦다(우리도 37분 지연 관측). 15분이면 GitHub Actions 발화 안정성↑, CoinGecko 부하↓, MVP 가격 fresh에는 영향 없음.
- **repo private → public 전환 (2026-05-17)** — Why: 15분으로 늘려도 1.5시간 schedule 발화 0건. public repo는 GitHub Actions cron 발화가 더 안정적이고 무료 한도 무제한. 트래킹 파일·git history 전체 검증 결과 secret 키 본문 0건(`qvsIha...` 0개, `sb_secret_` 다음 글자는 `*` 와일드카드만) 확인 후 안전하게 전환. service_role 키는 GitHub Secrets로 보호되어 visibility와 무관. 후속 모니터링은 다음 세션으로 이월.
- **Stage 2.5 소스 갱신 — CMC 공식 API + CoinGecko 혼합** — Why: 사용자 제안으로 CMC 페이지 검토 결과, Coinglass 30개 1:1 대체는 불가능하지만 Altcoin Season Index는 CMC 공식 API(`/v1/altcoin-season-index/latest`)가 존재해 합법적으로 가져올 수 있다. Pi Cycle/Puell/Rainbow 등은 CMC academy 정의를 따라 CoinGecko 종가로 자체 계산하는 길을 동시에 유지. 스크래핑·유료 API는 계속 미도입. 사용자 액션 — CMC Pro Basic 키 발급. CMC API에 Pi Cycle/Puell 전용 엔드포인트가 있는지 ★ 미확인 (키 받은 뒤 실제 호출로 확인).
- **Stage 2.5 강세장 정점 신호 — 백로그 추가, 무료 소스만** — Why: 30개 중 다수가 유료 온체인 API(Glassnode/Coinglass) 의존. MVP는 포트폴리오 우선. 무료(CoinGecko 가격 자체계산 + Farside/SoSoValue/bitcoin-data.com 등 공개 페이지)로 구현 가능한 ~18-23개만 추후 진행. 나머지는 N/A 표시. 가격 예측 금지 원칙은 유지하며 "통계 표시 전용" 면책 필수.
- **Vite 템플릿 `react-ts` (TypeScript) 선택** — Why: 포트폴리오/시세 타입 명확화, JS → TS 마이그레이션 비용 회피.
- **worker venv 생성을 사용자 액션으로 분리** — Why: `brew install`은 사용자 시스템 변경. CLAUDE.md §12 안전 원칙.
- **`requirements.txt` 최소(`python-dotenv` 1개)** — Why: CLAUDE.md §3 Simplicity. 실제 import 시점에 추가.
- **`.env.example` frontend/worker 별도 운영** — Why: 키 위치 = 노출 범위. service_role이 프론트에 흘러갈 위험 차단.
- **GitHub 저장소 `04.ai_agent` 유지 (A안)** — Why: 이전 세션에서 이미 push 완료. 작업 흐름 우선.
- **Vercel 도메인 `crypto-monitoring-one.vercel.app`** — Why: 의도한 이름이 이미 사용 중이라 `-one` suffix 자동. 라벨일 뿐 동작 영향 없음.
- **Railway 배포 보류 (D안)** — Why: trial credit 소진 + `main.py`가 즉시 종료 스크립트라 배포 검증 실익 낮음. 로컬 hello world로 워커 코드 검증 끝. Stage 1 폴러 완성 후 재결정.

---

## 미해결 질문
- 빈 `becks0724/crypto-monitoring` GitHub 저장소를 삭제할지 그대로 둘지 결정 필요. 작업 영향 없음. 삭제 시 `gh repo delete becks0724/crypto-monitoring --yes` (필요 시 `gh auth refresh -h github.com -s delete_repo` 선행).
- GitHub Actions cron 자동 발화 — indicators.yml은 1건 관측(3.5h 지연), price-poll.yml `*/15`은 여전히 0건 누적. 매일 cron(`0/15/30 1 * * *`)은 schedule 발화율이 더 높을 가능성 있음 — 다음 세션에서 fear-greed/candle-poll/indicators의 schedule 발화 추가 관측 여부 확인.
- 사용자 액션 (Stage 3 또는 2.5 진입 시):
  - Stage 2.5 진입 시: CMC Pro Basic API key 발급 (무료, 10k credits/월)
  - Stage 3 진입 시: CryptoPanic 무료 키 발급 가능 (public posts는 키 없이 가능, 키 발급 시 더 많은 endpoint 사용 가능)
- ChartModal prod 시각 검증 — `crypto-monitoring-one.vercel.app` 새로고침해서 HoldingsList "차트" 버튼 → 90일 line chart + RSI/MACD 텍스트 확인. 본 세션에서는 코드만 푸시·CLI 검증, 사용자 브라우저 검증은 미진행.
