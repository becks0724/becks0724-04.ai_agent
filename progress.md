# progress.md — crypto-monitoring

세션 종료 시 본 파일을 갱신한다. 다음 세션은 이 파일을 먼저 읽고 작업을 이어간다.

---

## 현재 상태 (2026-05-16)
**Stage 1 MVP 사실상 완료. 1-A/B/C/D 본 항목 모두 통과 (RLS 다중계정·번들 보안·Vercel prod end-to-end 모두 검증). 남은 결정 1건: 워커 long-running 호스팅 (Railway 유료/Render/Fly/GitHub Actions cron).**

| 영역 | 상태 | 비고 |
|---|---|---|
| 로컬 스캐폴드 | ✓ | frontend (Vite+TS) / worker (Python 3.11) |
| GitHub | ✓ | `becks0724/04.ai_agent` (private, main) |
| Supabase | ✓ | Singapore region, `plpkmaqyrqkjqnvnqexe.supabase.co` |
| Vercel | ✓ | `https://crypto-monitoring-one.vercel.app` |
| Railway | ⏸ 보류 | trial 만료, Stage 1의 long-running 폴러 완성 시 재결정 |

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

## 다음 할 일 (Stage 1)

### 1-A. 데이터 모델 (Supabase 마이그레이션) ★ SQL 초안 완료, 실행 대기
- [x] `worker/migrations/0001_init.sql` 작성
  - `portfolio_holdings` — id, user_id(FK→auth.users CASCADE), symbol, quantity, avg_buy_price, created_at, updated_at
    - `(user_id, symbol)` UNIQUE 제약 (중복 종목 등록 차단, 추가매수는 UPDATE)
    - `set_updated_at()` 트리거로 updated_at 자동 갱신
    - RLS: 본인 행만 select/insert/update/delete
  - `price_snapshots` — id(bigserial), symbol, price_usd, fetched_at
    - `(symbol, fetched_at desc)` 인덱스 (최신 시세 조회 최적화)
    - RLS: authenticated 읽기 전용, 쓰기는 service_role(=worker)만
- [ ] **사용자 액션 필요** — Supabase Dashboard → SQL Editor → `0001_init.sql` 붙여넣기 → Run
- [ ] 실행 후 검증
  - Table Editor에서 두 테이블 존재 확인
  - Authentication → Policies에서 RLS 정책 4건(holdings) + 1건(snapshots) 확인

### 1-B. 워커 시세 폴러
- `worker/price_poller.py` 작성
- 거래소 API 선택 (CoinGecko 또는 Binance public ticker, 둘 다 키 불필요)
- `supabase-py` 클라이언트 추가, `requirements.txt` 갱신
- `POLL_INTERVAL_SECONDS`, `POLL_SYMBOLS` 환경변수 사용
- 에러 핸들링 (rate limit, 네트워크 오류, 재시도 백오프)
- 로컬 1회 실행 → Supabase `price_snapshots` 적재 확인

### 1-C. 프론트 포트폴리오 CRUD
- `@supabase/supabase-js` 설치, 클라이언트 초기화
- 인증 페이지 (Supabase Auth — 이메일/매직링크 또는 OAuth)
- 보유 자산 등록 폼 (symbol, quantity, avg_buy_price)
- 보유 자산 목록·수정·삭제 UI
- 평가금액·손익 계산 + 가격 자동 갱신 (polling 또는 Realtime)

### 1-D. 검증
- 보유 자산 1건 등록 → 평가금액이 가격 변동에 따라 갱신
- 다른 사용자가 내 데이터를 조회 못 하는지 RLS 검증
- 프론트 번들 — `sb_secret`/`service_role` 검색 0건 재확인
- end-to-end — Vercel ↔ Supabase 동작 확인

---

## 보류 항목
- **Railway 배포** — Stage 1의 long-running 폴러 완성 후 결정 (Railway 유료 $5/월 vs Render Free vs Fly.io)
- **Stage 2.5 — 강세장 정점 신호 (Coinglass 30개 카탈로그 + CMC API 보강)** — checklist.md 백로그로 보존. 결정 갱신(2026-05-16): 출처는 **CMC 공식 API + CoinGecko 자체 계산 혼합** (Altcoin Season Index·Fear&Greed는 CMC API 우선, 나머지는 CoinGecko 종가 자체 계산). 페이지 스크래핑·유료 API 미도입. 구현 시점은 Stage 1·2 완료 후. 예상 가용 범위 20-23/30. **사용자 액션 — CMC Pro API key 발급(Basic 무료, 10k credits/월)**.

---

## 의사결정 로그

### 2026-05-16
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
