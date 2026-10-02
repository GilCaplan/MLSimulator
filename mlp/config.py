from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("MLP_DATA_DIR", ROOT / "data"))
FRONTEND_DIST = ROOT / "frontend" / "dist"
VERSION = "1.0.0"
PORT_RANGE = (8765, 8800)
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_CHART_POINTS = 1500

SUBDIRS = ("run", "logs", "projects", "datasets", "prepared", "jobs", "library", "downloads")
for _sub in SUBDIRS:
    (DATA_DIR / _sub).mkdir(parents=True, exist_ok=True)

SERVER_JSON = DATA_DIR / "run" / "server.json"
SERVER_LOG = DATA_DIR / "logs" / "server.log"
