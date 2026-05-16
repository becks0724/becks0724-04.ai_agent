# worker

크립토 데이터 수집·지표 계산·뉴스 분류를 담당하는 Python 워커.

## 요구사항
- Python **3.11** (CLAUDE.md 명시 버전)
- Railway 배포 대상

## 로컬 셋업

```bash
# 1. Python 3.11 설치 (없을 경우)
brew install python@3.11

# 2. venv 생성 및 활성화
cd worker
python3.11 -m venv .venv
source .venv/bin/activate

# 3. 의존성 설치
pip install -r requirements.txt

# 4. 환경변수 로드 및 실행 확인
cp ../.env.example .env       # 실제 값은 본인 환경에서 채워 넣을 것
python main.py
# → [worker] hello, world (env=local)
```

## 디렉토리 (예정)
```
worker/
├── main.py              # 진입점 (현재: hello world)
├── requirements.txt
├── .python-version
├── price_poller.py      # Stage 1
├── indicators/          # Stage 2
├── news/                # Stage 3 ~ 4
└── migrations/          # Supabase 마이그레이션 SQL
```

## Railway 배포 메모
- 빌드 커맨드: 기본 (Nixpacks가 `requirements.txt` 자동 감지)
- 실행 커맨드: `python main.py` (Stage 1부터는 long-running 폴러로 교체)
- 환경변수는 Railway 대시보드에서 주입. 코드·`.env`를 커밋하지 않는다.
