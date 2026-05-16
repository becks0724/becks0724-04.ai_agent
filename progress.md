# progress.md — crypto-monitoring

세션 종료 시 본 파일을 갱신한다. 다음 세션은 이 파일을 먼저 읽고 작업을 이어간다.

---

## 현재 상태 (2026-05-17)
**Stage 1 MVP 완전 마감.** 1-A/B/C/D + 워커 호스팅(GitHub Actions cron 15분 간격) 모두 통과. workflow_dispatch 첫 수동 실행 성공(24s) → Supabase price_snapshots id 7-9 적재 확인(BTC/ETH/SOL, KST 00:19). cron 주기는 5분 → 15분으로 조정 (무료 plan 발화 안정성↑). 이후 cron이 15분마다 자동 적재.

| 영역 | 상태 | 비고 |
|---|---|---|
| 로컬 스캐폴드 | ✓ | frontend (Vite+TS) / worker (Python 3.11) |
| GitHub | ✓ | `becks0724/04.ai_agent` (private, main). 2FA + Passkey 활성 |
| Supabase | ✓ | Singapore region, `plpkmaqyrqkjqnvnqexe.supabase.co`. RLS 다중계정 검증 통과 |
| Vercel | ✓ | `https://crypto-monitoring-one.vercel.app`, env vars 등록, end-to-end 통과 |
| 워커 호스팅 | ✓ | GitHub Actions cron `*/5 * * * *` (Railway/Render/Fly 미사용. Railway 보류는 종결) |

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
- 보안 조건 5/5 충족: private repo, secrets-as-env, 워커 코드 print 없음, 공식 actions만, GitHub 2FA + Passkey 활성.
- 수동 실행 24s 완료, Supabase id 7-9 적재 확인.

---

## 보류 항목
- **Railway 배포** — Stage 1의 long-running 폴러 완성 후 결정 (Railway 유료 $5/월 vs Render Free vs Fly.io)
- **Stage 2.5 — 강세장 정점 신호 (Coinglass 30개 카탈로그 + CMC API 보강)** — checklist.md 백로그로 보존. 결정 갱신(2026-05-16): 출처는 **CMC 공식 API + CoinGecko 자체 계산 혼합** (Altcoin Season Index·Fear&Greed는 CMC API 우선, 나머지는 CoinGecko 종가 자체 계산). 페이지 스크래핑·유료 API 미도입. 구현 시점은 Stage 1·2 완료 후. 예상 가용 범위 20-23/30. **사용자 액션 — CMC Pro API key 발급(Basic 무료, 10k credits/월)**.

---

## 의사결정 로그

### 2026-05-16
- **워커 호스팅 — GitHub Actions cron 채택 (2026-05-17)** — Why: 비용 0, Public/private repo 무료 한도(2000분/월) 충분, 30초→5분 폴링이 MVP에 부족하지 않음, 기존 GitHub 인프라 외 추가 도입 없음. Railway 유료/Render/Fly 모두 후순위 후보로 남김. 보안 조건 5/5 충족(private repo + 2FA + Passkey + secrets-as-env + 공식 actions만).
- **cron 주기 5분 → 15분 (2026-05-17)** — Why: 무료 plan에서 5분 cron은 첫 발화 지연이 30분+로 누락·지연이 잦다(우리도 37분 지연 관측). 15분이면 GitHub Actions 발화 안정성↑, CoinGecko 부하↓, MVP 가격 fresh에는 영향 없음.
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
