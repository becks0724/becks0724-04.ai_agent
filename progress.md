# progress.md — crypto-monitoring

세션 종료 시 본 파일을 갱신한다. 다음 세션은 이 파일을 먼저 읽고 작업을 이어간다.

---

## 현재 상태 (2026-05-18 후속 세션 마감 #2, **본 세션 누적 변경 파일 다수, 커밋 0건 — push 보류 결정 위임**)

**한 줄 요약** — Coinbase 디자인 + NewsFeed 캐러셀/번역 + ChartModal 3단 multi-pane + **Stage 2.5 14개 지표 적재(13 ok + 1 사용자 액션 대기)** 완료. peak-signals.yml은 여전히 push 전이라 cron 미발화 — push 시 자동 매일 02:30 UTC 발화.

**본 세션 산출 묶음**

1. **Coinbase 디자인 전면 적용** — `npx getdesign@latest add coinbase` 사양서 + Inter/JetBrains Mono + 흰 캔버스 + 단일 voltage Coinbase Blue + pill 100px + xl 24px. 6개 컴포넌트 전면 리스킨.

2. **NewsFeed 3단계 진화** — 단일 리스트 → 섹션 그룹화 → **카드 캐러셀**(chip 점프 + ←/→ 순환 + N/M) → **MyMemory 무료 번역 + localStorage 캐싱**. `lib/news.ts`에 `symbols: string[]` 임베딩 추가.

3. **2-E ChartModal multi-pane** — v5 `paneIndex` API로 단일 chart 세로 3단 동기 차트(가격 / RSI 14 + 30·70 reference / MACD line+Signal+Histogram + 0 reference). 모달 520×960px.

4. **Stage 2.5 인프라 + 1차 3 지표** — `peak_signals` 테이블(0008 SQL) + `peak_signals_poller.py` + `peak-signals.yml` cron 02:30 UTC + `lib/peakSignals.ts` + `PeakSignals.tsx`(명중·평균 진행률 헤더, 진행률 막대, status 배지, 면책). AppShell 통합. BTC 캔들 365일 백필(371행) — Pi Cycle 350d 충족.

5. **Stage 2.5-B1 자체계산 4 지표 추가** — `btc_rsi_22`(threshold 70), `ahr999`(threshold 1.2, days-from-genesis 회귀), `rainbow_band`(0-7, threshold ≥6, AHR999와 동일 회귀 baseline), `two_year_ma_multiple`(threshold 5, 730d 필요 → 현재 372d로 `insufficient_data` 적재).

6. **Stage 2.5-D 무료 온체인 4 지표** — bitcoin-data.com 무료 API(키 불필요): `puell_multiple`(threshold 4.0), `mvrv_z_score`(threshold 7.0), `nupl`(threshold 0.75), `mvrv_ratio`(threshold 3.7). `fetch_bitcoin_data()` + `compute_onchain_indicator()` 공통화로 4개 람다 일괄 추가.

7. **Stage 2.5-C 합법 무료 2 지표 (MSTR)** — 처음엔 SEC EDGAR 8-K 직접 파싱을 시도했으나 매주 8-K가 BTC 매입이 아니라 컨버터블 노트 환매 등이 섞여 정형 파싱 안정성 낮음 → CoinGecko `/companies/public_treasury/bitcoin` 무료 endpoint로 전환. `mstr_btc_holdings`(정보성, 818,869 BTC), `mstr_pnl_ratio`(threshold 2.0, 50.77%). `unit='BTC'` 타입 확장.

8. **Stage 2.5-B0 CMC 1 지표 (사용자 키 대기)** — `compute_altcoin_season_index()` 신규. CMC docs WebFetch 실패로 endpoint 정확성 검증 못함 → 추정 path `/v1/altcoin-season-index/latest` + 응답 구조 다중 키 fallback(`value` / `altcoin_season_index` / `index`). `CMC_API_KEY` env 없으면 `status=insufficient_data` note='사용자 액션 대기'. endpoint 오류 시 status=error + path/응답 키 목록을 note에 노출해 사용자 보정 가능.

9. **운영 안정화** — bitcoin-data.com 분당 한도 사고(8-11번 지표가 status=error로 ok 행 덮어쓰기)를 두 단계로 견고화:
   - **upsert 가드** — `status='error'` 행이 같은 captured_at에 `ok` 행이 이미 있으면 적재 안 함 (transient 429가 성공값을 덮어쓰는 사고 차단).
   - **bitcoin-data.com 429 첫 retry 60초 fixed sleep** — 백오프 `2/4/8s` → `60s/16s/64s`. 분당 한도가 60초면 풀리는 정형 패턴에 맞춤. 호출 사이 0.5s spacing 유지.

10. **CoinGlass Hobbyist tier — 사용자 결정 보류** — 검토 후 보류. `.env.example`에 `COINGLASS_API_KEY=` placeholder + `peak-signals.yml`에 secret 주입만 인프라 준비. 코드는 키 발급·결정 시 진행.

**진단 사례 (코드 변경 없음)**
- 사용자가 AVAX/LINK/INJ/GRIFFAIN/WLD/AAVE 신규 보유 추가 → 시세 미반영. catalog 매핑 진단 결과 10종 모두 정상. **원인은 단순 price-poll cron(15분) 발화 대기**. `gh workflow run price-poll.yml` 트리거로 03:31:59 UTC에 10종 일괄 적재 → 해결.

**로컬 검증 결과 (Stage 2.5, 14행 적재 완료)**

| # | 지표 | 출처 | 값 | hit | 진행률 |
|---|---|---|---|---|---|
| 1 | btc_dominance | coingecko | 58.22% | ❌ | 83.17% |
| 2 | mayer_multiple | computed | 0.9551 | ❌ | 39.79% |
| 3 | pi_cycle_top | computed | 0.3835 | ❌ | 38.35% |
| 4 | btc_rsi_22 | computed | 44.41 | ❌ | 63.44% |
| 5 | ahr999 | computed | 0.4720 | ❌ | 39.33% |
| 6 | rainbow_band | computed | 2 / 7 | ❌ | 33.33% |
| 7 | two_year_ma_multiple | computed | — | — | insufficient (372/730d) |
| 8 | puell_multiple | bitcoin-data | 0.7923 | ❌ | 19.81% |
| 9 | mvrv_z_score | bitcoin-data | 0.8177 | ❌ | 11.68% |
| 10 | nupl | bitcoin-data | 0.3087 | ❌ | 41.16% |
| 11 | mvrv_ratio | bitcoin-data | 1.4465 | ❌ | 39.09% |
| 12 | mstr_btc_holdings | coingecko | 818,869 BTC | — | — |
| 13 | mstr_pnl_ratio | coingecko | 1.0153 | ❌ | 50.77% |
| 14 | altcoin_season_index | cmc | — | — | insufficient (CMC_API_KEY 대기) |

전 지표가 정점 임계에서 멀다. BTC 약세장(~76k) 흐름 일관. **Stage 2.5 진행률 14 / ~23 = 60.9%** (Coinglass 30개 카탈로그 중 무료 가용 18-23개 기준).

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
| Stage 4 LLM 분류 (코드) | ✓ | 0007 SQL + news_classifier(Gemini 2.5 Flash-Lite, thinking_budget=0, response_mime_type=json) + news-classify.yml(매시간 :15 UTC) + NewsFeed 배지(positive/neutral/negative)·태그(상장/규제/해킹/파트너십/기술/일반) |
| Stage 4 LLM 분류 (적재) | 진행 중 | 약 34건 적재(다양한 sentiment·category 분포 확인). Gemini 무료 RPD 20건 한도로 cron이 매일 ~20건씩 약 4일에 걸쳐 102건 완료 예정 |
| Coinbase 디자인 | ✓ | `frontend/DESIGN.md`(getdesign 토큰 사양서) + Inter/JetBrains Mono + 흰 캔버스 + Coinbase Blue 단일 voltage + pill 100px + xl 24px. 6개 컴포넌트 전면 리스킨 |
| NewsFeed 카드 캐러셀 + 번역 | ✓ | 섹션 chip 점프 + ←/→ 순환 + MyMemory 무료 번역(localStorage 영구 캐시) + symbols 임베딩 |
| ChartModal multi-pane | ✓ | v5 `paneIndex` API로 가격/RSI(30·70 reference)/MACD(line+Signal+Histogram, 0 reference) 세로 3단 동기 차트 |
| Stage 2.5 1차 (3 지표) | 진행 중 | 0008 SQL 실행 완료 + 워커 로컬 1회 실행 3행 적재. **push 전이라 peak-signals cron 미발화** — push 시 매일 02:30 UTC 자동 발화 |

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

### 사용자 결정 대기 (가장 우선)
- **누적 변경 push 결정** — Stage 2.5 1차 + B1 + D + C(MSTR) + B0 skeleton + 운영 안정화 + Coinbase 디자인 + NewsFeed 캐러셀 등. 분할 권장 4-5 commit:
  1. `feat(frontend): Coinbase 디자인 적용 (DESIGN.md + 전체 리스킨)`
  2. `feat(news): 카드 캐러셀 + 섹션 분류 + 한글 번역 + symbols 임베딩`
  3. `feat(stage2.5): peak_signals 인프라 + 13 지표(자체계산 7 + bitcoin-data 4 + MSTR 2)`
  4. `feat(stage2.5-b0): CMC altcoin_season_index skeleton (CMC_API_KEY 대기)`
  5. `fix(peak): bitcoin-data 60s first-retry + upsert error 가드`

### CMC key 발급 후 사용자 알림 (2.5-B0 활성화)
- 사용자가 CMC Basic 무료 plan 키 발급 + `worker/.env`에 `CMC_API_KEY=<값>` 저장 + `gh secret set CMC_API_KEY` 후 신호 시:
  - 로컬 1회 dry-run으로 `altcoin_season_index` 행을 status=ok/error 중 어느 쪽으로 적재되는지 확인
  - status=error면 note의 path 또는 응답 키 목록을 보고 endpoint 또는 응답 키 보정 (이미 코드가 디버깅 정보 노출 준비됨)

### CoinGlass Hobbyist 결정 (보류 상태)
- 도입 결정 시 — Hobbyist $29/월 결제 + 키 발급 + ETF flow endpoint 확인 + `compute_etf_flow()` 통합
- 영구 보류 시 — `.env.example`의 `COINGLASS_API_KEY` placeholder 삭제 + workflow yml secret 주입 제거

### push 후 즉시 수행
- `gh workflow run peak-signals.yml` 트리거 → GitHub Actions에서 14행 첫 적재 확인 (로컬과 일치할 것)
- Vercel 자동 배포 → prod URL [crypto-monitoring-one.vercel.app](https://crypto-monitoring-one.vercel.app)에서 시각 검증

### 자동 진행 (push 후, 사용자 액션 없음)
- `peak-signals.yml` cron 매일 02:30 UTC 자동 발화 (14 지표 일별 적재. CMC key 미발급이면 `altcoin_season_index`는 계속 insufficient_data)
- `candle-poll.yml` 매일 누적 → `two_year_ma_multiple`이 730일 누적 시 자동 활성화 (현재 372d → 약 358일 후)
- `news-classify.yml` cron 매시간 :15 UTC × Gemini RPD 20건 → 102건 점진 백필
- 다른 cron 워크플로 정상 (price-poll 15분, fear-greed 01:00, candle-poll 01:15, indicators 01:30, news-poll :05, coins-catalog 02:00, news-classify :15)

### 시각 검증 (사용자 브라우저, push + Vercel 배포 후)
- **Coinbase 디자인 전면** — 흰 캔버스 + Coinbase Blue + pill CTA 일색
- **PeakSignals 표 14행** — 명중 0/12 + insufficient 2(2y MA, Altcoin Season) + 평균 진행률 ~42%
- **HoldingForm** — datalist 자동완성
- **ChartModal multi-pane** — 가격/RSI/MACD 세로 3단 동기 차트
- **NewsFeed 카드 캐러셀** — 필터/그룹 + 섹션 chip + ←/→ + 한글 번역
- 검증 쿼리(SQL Editor):
  ```sql
  -- peak_signals 14행 확인
  select signal_key, value, threshold, hit, progress_pct, status, note, captured_at
    from peak_signals order by captured_at desc, signal_key;
  -- 분류 분포
  select sentiment, count(*) from news_classifications group by sentiment order by 2 desc;
  select event_category, count(*) from news_classifications group by event_category order by 2 desc;
  ```

### 본 작업 분기점 (사용자 선택)
- **Stage 2.5 추가 확장** — Bull Market Support Band(20wSMA + 21wEMA), CMC `/v1/global-metrics/quotes/latest`(ETH 도미넌스 등 보조), Coinbase Premium index 등
- **Stage 5 — 실시간화** — WebSocket + Fly.io 등 long-running 호스팅 이전 (현재 GitHub Actions cron은 30초 폴링 불가)
- **Stage 4 paid tier** — Gemini paid는 RPD/RPM 제한 해제 + 비용 극소. 102건 즉시 완료

### 단기 잔여
- 빈 `becks0724/crypto-monitoring` 저장소 삭제 결정
- cron schedule 발화 모니터링 — push 후 peak-signals 02:30 UTC 자동 발화 관측
- IDE Python interpreter 설정 (`.vscode/settings.json`에 `python.defaultInterpreterPath: worker/.venv/bin/python3.11`) — false positive diagnostics 해소 (선택)

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

### 2026-05-18 후속 #2 (Stage 2.5 확장 — 13 추가 지표 + B0 skeleton + 운영 안정화)
- **2.5-B1 5개 자체계산 우선 진행** — Why: 사용자 액션(키 발급) 없이 즉시 추가 가능. BTC 캔들이 이미 372d 있어 RSI 22 / AHR999(200d 기하평균 + 회귀가격) / Rainbow Band(log 회귀, AHR999와 동일 baseline) 즉시 계산. 2y MA Multiple(730d 필요)은 skeleton만 활성화하고 candle-poll 누적으로 자연 활성화 대기.
- **Rainbow Band 회귀식 보정** — Why: 초기 Bitcoin Magazine blocks 기반 회귀(`2.66 × log10(blocks) - 17.92`)에 days를 넣어 baseline이 1e-8 USD로 비현실 → band_idx clamp 7로 잘못된 명중. AHR999와 동일한 days-from-genesis 회귀(`5.84 × log10(age_days) - 17.01`)로 통일 → baseline ~158k(예측가) → band 2(Accumulate) 안정.
- **2.5-D 4개 온체인 — bitcoin-data.com 무료 채택** — Why: 키 불필요 + REST endpoint 명확(`/api/v1/{key}/last`) + 응답 정형. WebFetch가 docs 못 잡았지만 직접 curl probe로 4개 endpoint(`puell-multiple`/`mvrv-zscore`/`nupl`/`mvrv`) 모두 200 검증. 응답 구조 동일해 `compute_onchain_indicator()` 1 함수로 4개 일괄 처리.
- **2.5-C MSTR — SEC EDGAR → CoinGecko로 전환** — Why: 처음엔 SEC EDGAR 8-K 직접 파싱을 시도했으나 실제 8-K 본문이 BTC 매입이 아닌 컨버터블 노트 환매 / 기타 이벤트와 섞여 정형 파싱 신뢰성 낮음. CoinGecko `/companies/public_treasury/bitcoin`이 Strategy 포함 상장사 BTC 보유 데이터(`total_holdings`, `total_entry_value_usd`, `total_current_value_usd`, `percentage_of_total_supply`)를 정형 응답으로 직접 제공 — 키 불필요, 8-K 파싱을 CoinGecko가 대신 해주는 효과. 사용자 의도(MSTR 보유량) 100% 충족.
- **MSTR 평균 매입가 ratio threshold 2.0** — Why: 2021/2024 사이클 top에서 MSTR PnL ratio ~2.4-2.5 관측. 2.0이 명중 임계. 현재 1.0153(BTC 76k, MSTR 평균 매입가 ~75.5k)로 진행률 50.77%.
- **Strategy rebrand 대응** — Why: MicroStrategy가 2025년 Strategy로 사명 변경. `_find_strategy()` 헬퍼에서 name이 `Strategy` 또는 `MicroStrategy`인 항목 모두 매칭하도록 처리. CIK 0001050446은 동일.
- **ETF flow — CoinGlass Hobbyist 보류** — Why: CoinGlass docs WebFetch 불가능, 일반적으로 ETF endpoint는 Hobbyist tier($29/월) 이상으로 알려짐. 무료 합법 대안 부재(SosoValue/Farside는 비공식 스크랩, SEC 13F-HR은 분기 단위, Polygon.io free는 가격만). 사용자 결정 — 보류. 인프라(.env.example + workflow secret 주입)만 준비.
- **2.5-B0 CMC Altcoin Season Index — skeleton 우선 적재** — Why: CMC docs WebFetch도 정확한 endpoint path 못 알려줘 `/v1/altcoin-season-index/latest`로 추정. 사용자 키 발급 후 첫 호출 결과로 status=ok/error를 보고 보정 가능하도록 코드가 도와줌(error 시 note에 path + 응답 키 목록 노출). 키 없으면 `insufficient_data` note='CMC_API_KEY missing — 사용자 액션 대기'로 행 적재 → UI에 무엇을 기다리는지 명시.
- **운영 안정화 1 — upsert 가드** — Why: bitcoin-data.com 분당 한도 사고로 8-11번 지표가 status=error로 적재됐는데, 그게 같은 captured_at의 이전 ok 행을 덮어써서 사용자 화면에 "오류" 표시. upsert 가드 — `status='error'`는 같은 captured_at에 ok 행이 이미 있으면 skip. 한 번이라도 ok 적재되면 transient 429 발생 시에도 표시 유지.
- **운영 안정화 2 — bitcoin-data.com 429 첫 retry 60초 fixed sleep** — Why: 백오프 `2/4/8s`로는 분당 한도(60초 cooldown 정형)가 못 풀려 4 endpoint 모두 실패. `60s/16s/64s`로 첫 retry에 분당 한도 리셋 보장. 호출 사이 0.5s spacing 유지. cron 일 1회 환경에선 발생 안 하나, 로컬 다중 실행 + 다음 cron 발화 안전 보장.
- **IDE Python interpreter mismatch false positive** — Why: IDE가 시스템 Python 3.9를 가리켜 `httpx`, `dotenv`, `supabase`를 못 찾는다고 표시. 워커는 `worker/.venv` Python 3.11에서 실행되므로 무관. 향후 `.vscode/settings.json`에 `python.defaultInterpreterPath`로 명시 가능(선택).

### 2026-05-18 후속 (Coinbase 디자인 + 카드 캐러셀 + 번역 + ChartModal 3단 + Stage 2.5 1차)
- **Coinbase 디자인 채택 — `getdesign add coinbase` 사양서 기반** — Why: 사용자가 명시적으로 Coinbase 스타일 요구. `npx getdesign@latest add coinbase` CLI가 무료로 토큰 사양서(YAML frontmatter + 컴포넌트 명세)를 `frontend/DESIGN.md`로 생성. Inter / JetBrains Mono를 CoinbaseDisplay/Sans / CoinbaseMono의 공식 대체 폰트로 채택(라이선스 없는 안전 선택). 흰 캔버스 + 단일 voltage Coinbase Blue + pill 100px geometry로 통일 — 다크 톤 흔적 일소.
- **NewsFeed 카드 캐러셀로 재설계** — Why: 사용자 명시 — "한 번에 모든 뉴스 보기보다 한 건씩 넘겨서 보기 + 기존 카테고리 분류 유지". 섹션 chip(라벨+카운트)으로 카테고리 점프 + 현재 섹션 내 ←/→ 순환(wrap). 단일 섹션(시간순)이면 chip 자동 숨김. 32px padding 큰 회색 카드(`#f7f7f7` 16px radius)에 24px 헤드라인 표시 — 가독성·집중도 향상.
- **뉴스 번역 — MyMemory 무료 API + localStorage 캐싱** — Why: 사용자가 영문 뉴스 한글화 요구. 워커에서 LLM 번역 추가하면 Gemini RPD 20 한도와 충돌. MyMemory는 키 불필요·CORS 허용·IP당 일 5천 단어 한도. localStorage에 영구 캐시(동일 헤드라인은 1회만 호출). 현재 카드 + 인접 4건 prefetch — 사용자 ←/→ 누르기 전에 미리 준비. 번역 실패(원문 echo) 시 캐시 안 함. 영문 원본은 작은 회색 이탤릭으로 함께 노출(검증 가능성 확보).
- **ChartModal multi-pane — v5 `paneIndex` API** — Why: checklist 2-E "RSI/MACD 보조 패널" 항목이 단순 최신값 Stat 카드로만 충족된 상태였음. 정통 TradingView 패턴은 가격 + RSI + MACD 세로 적층. lightweight-charts v5는 `addSeries(LineSeries, opts, paneIndex)` 인자로 단일 chart에서 multi-pane 지원 → 별도 인스턴스 없이 x축 자동 동기화. `createPriceLine`으로 RSI 30·70 / MACD 0 reference 점선 추가. Histogram은 hist 부호에 따라 컬러 분기(±).
- **Stage 2.5 우선순위 — 키 불필요 3 지표부터** — Why: 사용자 액션(CMC Pro key 발급)을 기다리지 않고 즉시 진행 가능한 영역부터. CoinGecko `/global`로 BTC 도미넌스(키 불필요) + BTC candles로 Mayer Multiple(200dMA)·Pi Cycle Top(350dMA × 2) 자체 계산. 추가 외부 의존성 0. 1차 구현으로 인프라(peak_signals 테이블 + 워커 골격 + 프론트 표) 검증.
- **peak_signals 스키마 — status 컬럼으로 데이터 부족 추적** — Why: Pi Cycle은 350일 candle 누적이 필수인데, candle-poll이 cron 시작 후 며칠 동안은 미충족. `status='insufficient_data'` 값으로 행을 적재해 (1) "왜 비어있나" 디버깅 가능 (2) 프론트에서 "데이터 누적 중" 안내 표시 가능 (3) hit/progress null로 평균 계산에서 자연 제외. 단순 skip보다 운영 가시성 우월.
- **BTC 캔들 365일 백필 (`-f days=365`)** — Why: 기존 candle-poll은 일별 days=2(어제·오늘)만 적재. Pi Cycle 350일 SMA에는 95+ days 부족. workflow_dispatch days input으로 1회 365일 백필 → 371행 적재로 충당. 2년/4년 MA(2.5-B1)는 별도 외부 데이터 필요(CoinGecko 무료 plan 365일 한도).
- **AppShell 배치 — 포트폴리오 ↔ peak_signals ↔ 뉴스** — Why: 사용자 의사결정 흐름이 자기 포지션 → 거시 신호 → 시장 뉴스 순서. Coinbase 마케팅 페이지의 editorial rhythm과도 일치.
- **AVAX 등 신규 심볼 미반영 진단** — Why: 사용자가 6종 추가 후 즉시 표시 안 됨 → catalog 진단 결과 매핑 모두 정상. 단순 cron 발화 대기. 코드 변경 없이 `gh workflow run`으로 해결. **교훈** — 보유 추가 직후 ~15분간 시세 미보유는 정상 동작이며 SummaryBox 경고 문구로 이미 안내 중. UX 차후 개선 — "지금 새로고침" 사용자 액션 버튼 검토.

### 2026-05-18 (Stage 4 LLM 분류 — Gemini 무료 tier)
- **Anthropic → Gemini 전환** — Why: Anthropic API는 무료 크레딧 없이 결제 등록 필수. 사용자 무료 옵션 요구로 Google AI Studio Gemini 무료 tier 채택. 본 워커 규모(매시간 ~10건)는 무료 한도 안.
- **gemini-2.5-flash-lite + thinking_budget=0** — Why: 2.5 시리즈는 thinking 모델이라 응답 전 내부 추론에 max_output_tokens 소진 → 응답 텍스트가 비거나 '{' 단독으로 끊겨 parse 실패. ThinkingConfig(thinking_budget=0)로 비활성. 분류는 단순 작업이라 lite 모델로 품질 손실 없음.
- **무료 RPD 20건 한도 발견** — Why: gemini-2.5-flash·flash-lite 둘 다 무료 일별 한도 20건(공식 문서엔 1000+ 표기되나 실제 quotaId 'PerDay' value 20). 본 워커 102건 백필을 한 번에 처리 불가. 사용자 결정 — cron 매시간 :15 UTC 자동 발화로 약 4일에 걸쳐 점진 분류. 결제 등록 시 paid tier로 즉시 완료 가능하나 본 단계는 무료 유지.
- **FATAL 분류 정교화** — Why: 첫 dispatch에서 "billing" 키워드가 분당 quota 메시지("check your plan and billing details")에 포함되어 일시적 RPM 초과를 영구 오류로 잘못 abort. "billing" 단독 매칭 제거, "PerDay"·"api key not valid"·"permission denied"·"unauthenticated"·"user location is not supported"만 fatal. 분당 quota는 Gemini 응답의 retryDelay 추출해 정확한 sleep.
- **호출간 sleep 6→13→7s** — Why: 2.5-flash RPM 5, 2.5-flash-lite RPM 10 — 실측 후 조정. 분당 ~8.5 호출로 안전 마진.
- **NewsFeed UI — sentiment 배지 + event 태그** — Why: 분류 결과 시각화. positive 녹 / neutral 노 / negative 빨 배지 + 카테고리 한국어 태그. 분류 안 된 뉴스는 기존 메타라인만 표시(점진 백필 친화). PostgREST 1:1 임베딩 사용.

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
