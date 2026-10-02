#!/usr/bin/env bash
# One-shot setup for macOS and Linux: Python environment, interface build, app icon / desktop launcher.
#   bash scripts/setup.sh          (add --gpu on Linux to keep the CUDA build of PyTorch)
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
OS="$(uname -s)"
GPU=0; [[ "${1:-}" == "--gpu" ]] && GPU=1

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# 1. Python environment
if [[ ! -x .venv/bin/python ]]; then
  say "Creating the Python environment (a few minutes the first time)…"
  if command -v uv >/dev/null; then
    uv venv --python 3.11 .venv
    PIP=(uv pip install --python .venv/bin/python)
  else
    command -v python3 >/dev/null || { echo "Python 3.10+ is required: https://www.python.org/downloads/"; exit 1; }
    python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' || { echo "Python 3.10+ is required (found $(python3 --version))."; exit 1; }
    python3 -m venv .venv || { echo "Couldn't create a virtual environment. On Debian/Ubuntu: sudo apt install python3-venv"; exit 1; }
    .venv/bin/python -m pip install --upgrade pip >/dev/null
    PIP=(.venv/bin/python -m pip install)
  fi
  if [[ "$OS" == "Linux" && $GPU == 0 ]] && ! command -v nvidia-smi >/dev/null; then
    say "No NVIDIA GPU found — installing the (much smaller) CPU build of PyTorch…"
    "${PIP[@]}" torch --index-url https://download.pytorch.org/whl/cpu
  fi
  "${PIP[@]}" -r requirements.txt
fi

# 2. Interface
command -v npm >/dev/null || { echo "Node.js 18+ is needed once to build the interface: https://nodejs.org"; exit 1; }
say "Building the interface…"
(cd frontend && (npm ci || npm install) && npm run build)

# 3. Launchers
if [[ "$OS" == "Darwin" ]]; then
  zsh launcher/build_app.sh
  say "Done. Double-click 'ML Playground' on your Desktop or in ~/Applications."
else
  bash launcher/install_linux.sh
  say "Done. Open 'ML Playground' from your applications menu or Desktop — or run: .venv/bin/python launcher/launch.py"
fi
