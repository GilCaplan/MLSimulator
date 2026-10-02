#!/bin/zsh
# Development: backend on 8765 with auto-reload-free restart, Vite dev server on 5173 (proxies /api).
cd "$(dirname "$0")/.."
.venv/bin/python -m mlp.main --port 8765 &
BACK=$!
trap "kill $BACK" EXIT
cd frontend && npx vite
