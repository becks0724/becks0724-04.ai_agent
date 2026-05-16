# progress.md — crypto-monitoring

세션 종료 시 본 파일을 갱신한다. 다음 세션은 이 파일을 먼저 읽고 작업을 이어간다.

---

## 현재 상태
**Stage 0 진행 중 — 로컬 스캐폴드 완료, 외부 서비스 연동 대기**

- 로컬 디렉토리·툴체인 셋업은 끝남
- Supabase / Vercel / Railway 연결은 사용자 액션 필요 (계정·프로젝트 생성)
- Python 3.11 미설치 — 사용자가 `brew install python@3.11` 후 venv 생성 예정

---

## 완료한 작업

### 2026-05-16
- 기획·범위 정의, `CLAUDE.md` / `checklist.md` / `progress.md` 초기 작성
- Git 저장소 초기화 (`main` 브랜치), 루트 `.gitignore` 작성 (`.env*`, `node_modules`, `__pycache__`, `.venv` 등 포함)
- `frontend/` 스캐폴드 — Vite + React **TypeScript** 템플릿, `npm install` 완료, `npm run build` 성공
- `worker/` 스캐폴드 — `main.py`(hello world, Korean 헤더), `requirements.txt`(python-dotenv), `.python-version`(3.11), `README.md`
- `frontend/.env.example`, `worker/.env.example` 생성 — 키 분리 정책 코드로 표현
- `CLAUDE.md`에 "환경변수 분리 정책" 섹션 추가

---

## 다음 할 작업

### 사용자 액션 (외부 서비스)
1. **Python 3.11 설치 후 worker venv 구성**
   ```bash
   brew install python@3.11
   cd worker && python3.11 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
   cp .env.example .env
   python main.py   # → [worker] hello, world (env=local)
   ```
2. **Supabase 프로젝트 생성** — URL, anon key, service_role key 확보
   - `frontend/.env.local` ← `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `worker/.env` ← `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Vercel 프로젝트 연결** — 이 저장소를 가리키고 `frontend/`를 root로 설정, 환경변수는 Vercel 대시보드에 등록
4. **Railway 프로젝트 연결** — 동일 저장소 `worker/` 경로, 환경변수는 Railway 대시보드에 등록, 실행 커맨드 `python main.py`로 hello world 1회 확인

### 코드 작업 (Stage 1 진입 전 준비)
- Stage 0 사용자 액션이 마무리되면 `checklist.md` Stage 1-A(데이터 모델)부터 시작
- `worker/migrations/` 디렉토리 신설, 첫 마이그레이션 SQL(`portfolio_holdings`, `price_snapshots`, RLS 정책) 작성

---

## 의사결정 로그

### 2026-05-16
- **Vite 템플릿을 `react-ts`(TypeScript) 선택** — Why: 포트폴리오·시세 데이터의 타입 명확화, 향후 Supabase 자동 타입 생성과의 정합성. JS로 시작했다가 마이그레이션하는 비용보다 처음부터 TS로 가는 편이 낫다고 판단.
- **Stage 0의 venv 생성을 사용자 액션으로 분리** — Why: 로컬에 Python 3.11이 없고, `brew install`은 사용자 시스템 상태를 바꾸므로 임의로 실행하지 않음. CLAUDE.md §12의 "안전 우선" 원칙.
- **`requirements.txt`는 `python-dotenv` 1개만 등재** — Why: CLAUDE.md §3 "Simplicity First". 거래소 SDK·supabase-py 등은 실제로 import하는 시점에 추가한다.
- **`.env.example` 파일을 frontend/worker 별도 운영** — Why: 키의 위치가 곧 노출 범위(VITE_* = 클라이언트 번들, 그 외 = 서버). 한 파일에 섞으면 service_role 키가 프론트에 흘러갈 위험이 생긴다.

---

## 미해결 질문
- (없음 — 작업 중 발생하면 누적 기록)
