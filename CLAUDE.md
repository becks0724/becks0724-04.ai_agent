# CLAUDE.md — crypto-monitoring

## 프로젝트 개요
크립토 포트폴리오 모니터링과 뉴스·지표 대시보드를 제공하는 웹 애플리케이션이다.
사용자는 수동으로 보유 자산을 입력하고, 실시간 시세·기술적 지표·뉴스 감성을 한 화면에서 확인한다.

## 현재 단계 (2026-05-17 기준)
- **Stage 0 완료** — Git/스캐폴드(Vite+TS, Python 3.11)/GitHub(`becks0724/04.ai_agent` **public**)/Supabase(Singapore)/Vercel(`crypto-monitoring-one.vercel.app`) 모두 검증 완료.
- **Stage 1 MVP 완료** — 데이터 모델(`portfolio_holdings`, `price_snapshots`, RLS 4+1정책), 워커 시세 폴러(CoinGecko 15종 매핑, 백오프, graceful shutdown), 프론트 포트폴리오 CRUD(Magic Link Auth + KRW↔USD 환산 + 평가금액·손익 + 30초 polling), 검증(RLS 다중계정, 번들 보안, Vercel end-to-end) 모두 통과.
- **워커 호스팅 결정** — **GitHub Actions cron `*/15 * * * *`** (`.github/workflows/price-poll.yml`, POLL_ONCE 모드). Railway/Render/Fly는 미사용. Railway 보류 항목은 종결.
- **잔여(다음 세션 첫 작업)** — GitHub Actions schedule trigger 자동 발화가 누적되었는지 확인. 누적 0건이면 외부 cron(cron-job.org) 또는 Fly.io 재검토.
- **다음 본 작업** — Stage 2 (캔들 수집 + RSI/MACD + 공포·탐욕 지수).
- 세부 진행 사항은 `progress.md`, 작업 단위 체크리스트는 `checklist.md`.

## 기술 스택
- **프론트엔드** — React + Vite (TypeScript), Vercel 배포
- **워커/백엔드** — Python 3.11, **GitHub Actions cron 호스팅** (`*/15 * * * *`, POLL_ONCE 모드. 향후 30초 폴링 등 필요 시 Fly.io 등 long-running으로 이전 검토)
- **DB** — Supabase (PostgreSQL, Singapore region)
- **외부 API** — CoinGecko 시세(공개, 키 불필요), Frankfurter.dev/open.er-api(USD/KRW 환율, 무료 폴백), CryptoPanic API, RSS 피드, LLM API (Stage 4)

## 디렉토리 구조
```
04.ai_agent/
├── .github/workflows/   # GitHub Actions (price-poll.yml — 워커 cron)
├── frontend/            # React + Vite TS (Vercel 배포)
│   ├── src/lib/         # supabase, useAuth, holdings, prices, fx, errors
│   └── src/components/  # Login, AppShell, HoldingForm, HoldingsList
├── worker/              # Python 3.11 (GitHub Actions cron 실행)
│   ├── price_poller.py  # CoinGecko 폴러 (POLL_ONCE 지원)
│   ├── coingecko_ids.py # 심볼 → coingecko_id 매핑
│   └── migrations/      # Supabase SQL (0001_init.sql)
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
