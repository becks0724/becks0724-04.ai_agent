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

### 1-A. 데이터 모델
- [ ] Supabase `portfolio_holdings` 테이블 설계 (id, user_id, symbol, quantity, avg_buy_price, created_at, updated_at)
- [ ] Supabase `price_snapshots` 테이블 설계 (id, symbol, price_usd, fetched_at)
- [ ] RLS(Row Level Security) 정책 — 본인 데이터만 접근 가능하도록 설정
- [ ] 마이그레이션 SQL을 `worker/migrations/` 또는 Supabase migrations에 저장

### 1-B. 워커 — 시세 폴링
- [ ] 거래소 시세 API 선택 (예: Binance public ticker, CoinGecko)
- [ ] `worker/price_poller.py` 작성 — N초 간격으로 가격 조회 후 `price_snapshots`에 적재
- [ ] 폴링 주기·심볼 목록을 환경변수로 분리
- [ ] 에러 핸들링 (rate limit, 네트워크 오류, 재시도 백오프)
- [ ] Railway(유료) 또는 Render/Fly(무료 대안) 중 결정 후 long-running 프로세스로 배포
- [ ] 로컬 1회 수동 실행 → Supabase에 레코드 적재 확인

### 1-C. 프론트엔드 — 포트폴리오 CRUD
- [ ] Supabase 클라이언트 셋업 (`@supabase/supabase-js`, 환경변수 주입)
- [ ] 인증 페이지 (Supabase Auth, 이메일/매직링크 또는 OAuth)
- [ ] 보유 자산 등록 폼 (symbol, quantity, avg_buy_price)
- [ ] 보유 자산 목록 조회·수정·삭제 UI
- [ ] 최신 가격 조회 → 평가금액·손익 계산·표시
- [ ] 가격 자동 갱신 (polling 또는 Supabase Realtime 구독)

### 1-D. 검증
- [ ] 보유 자산 1건 등록 → 평가금액이 가격 변동에 따라 갱신되는지 확인
- [ ] 다른 사용자가 내 데이터를 조회할 수 없는지 RLS 검증
- [ ] 프론트 번들에 API 키가 포함되지 않는지 빌드 산출물 검사
- [ ] Vercel + Railway + Supabase end-to-end 동작 확인

---

## Stage 2 · 캔들 수집 + 기술적 지표 + 공포·탐욕 지수

- [ ] 캔들 데이터 테이블 설계 (timeframe별)
- [ ] 워커에서 OHLCV 수집 잡 구현
- [ ] RSI 계산 모듈 (Python, worker)
- [ ] MACD 계산 모듈 (Python, worker)
- [ ] 공포·탐욕 지수 API 연동 및 적재
- [ ] 프론트 차트 컴포넌트 (예: lightweight-charts)
- [ ] 지표 오버레이 UI

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
