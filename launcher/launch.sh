#!/bin/zsh
# ML Playground launcher: reuse a running server or start one on a free port, then open the browser.
PROJECT="__PROJECT__"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$PROJECT/data/logs" "$PROJECT/data/run"
LOG="$PROJECT/data/logs/launcher.log"
exec >>"$LOG" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') launch"

notify() { osascript -e "display notification \"$1\" with title \"ML Playground\"" >/dev/null 2>&1 }
fail() {
  echo "ERROR: $1"
  osascript -e "display dialog \"$1\n\nDetails: $LOG\" with title \"ML Playground\" buttons {\"OK\"} default button 1 with icon caution" >/dev/null 2>&1
  exit 1
}

cd "$PROJECT" 2>/dev/null || fail "Couldn't find the ML Playground folder at $PROJECT."

healthy() { curl -sf --max-time 1 "http://127.0.0.1:$1/api/health" >/dev/null 2>&1 }

# 1. Already running? (trust server.json only if the pid is alive AND it answers)
if [[ -f data/run/server.json ]]; then
  pid=$(sed -n 's/.*"pid": *\([0-9]*\).*/\1/p' data/run/server.json)
  port=$(sed -n 's/.*"port": *\([0-9]*\).*/\1/p' data/run/server.json)
  if [[ -n "$pid" && -n "$port" ]] && kill -0 "$pid" 2>/dev/null && healthy "$port"; then
    echo "already running on $port (pid $pid)"
    open "http://localhost:$port/"
    exit 0
  fi
fi

# 2. First-run setup: Python environment
if [[ ! -x .venv/bin/python ]]; then
  notify "Setting things up (first launch only, a few minutes)…"
  if command -v uv >/dev/null; then
    uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements.txt || fail "Installing Python packages failed."
  else
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt || fail "Installing Python packages failed (Python 3.10+ is required)."
  fi
fi

# 3. First-run setup: build the interface
if [[ ! -f frontend/dist/index.html ]]; then
  command -v npm >/dev/null || fail "Node.js is needed once to build the interface. Install it from nodejs.org, then try again."
  notify "Building the interface (first launch only)…"
  (cd frontend && (npm ci || npm install) && npm run build) || fail "Building the interface failed."
fi

# 4. Start on a free port
port=$(.venv/bin/python scripts/find_port.py 8765 8800) || fail "No free port between 8765 and 8800."
echo "starting on $port"
nohup .venv/bin/python -m mlp.main --port "$port" >> data/logs/server.log 2>&1 &
for i in {1..80}; do
  if healthy "$port"; then
    echo "up after $i polls"
    open "http://localhost:$port/"
    exit 0
  fi
  sleep 0.25
done
fail "The server didn't start within 20 seconds."
