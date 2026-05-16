# Railway 배포용 워커 진입점. Stage 1에서 시세 폴러로 확장된다.
from __future__ import annotations

import os
import sys
from dotenv import load_dotenv


def main() -> int:
    load_dotenv()
    env = os.getenv("WORKER_ENV", "local")
    print(f"[worker] hello, world (env={env})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
