#!/usr/bin/env bash
# Setup for macOS and Linux: Python environment, interface build, app icon / desktop launcher, then opens the app.
#
#   bash scripts/setup.sh [--no-launch] [--no-shortcuts] [--gpu]
#
# Needs only bash + curl + tar. If Python 3.10+ or Node.js 18+ are missing, private copies are downloaded into
# .tools/ inside the project (uv + a managed Python, portable Node.js) — nothing is installed system-wide, no sudo.
#   --no-launch  don't open the app at the end (for scripts / AI agents)
#   --no-shortcuts  skip the app icon / desktop entry
#   --gpu        Linux: keep the CUDA build of PyTorch even if no NVIDIA GPU is detected
# MLP_PRIVATE_TOOLS=1 ignores any system Python/Node.js and always uses the private copies in .tools/.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OS="$(uname -s)"
ARCH="$(uname -m)"
LAUNCH=1; GPU=0; SHORTCUTS=1
for a in "$@"; do
  case "$a" in
    --no-launch) LAUNCH=0 ;;
    --gpu) GPU=1 ;;
    --no-shortcuts) SHORTCUTS=0 ;;
    --yes|-y) ;;  # accepted for compatibility: setup never asks questions
    *) echo "Unknown option: $a"; exit 2 ;;
  esac
done
NODE_VERSION=22.12.0
TOOLS="$ROOT/.tools"
if [[ "${MLP_PRIVATE_TOOLS:-0}" == 1 ]]; then
  export PATH="$TOOLS/node/bin:$TOOLS/uv:$TOOLS/uv/bin:/usr/bin:/bin:/usr/sbin:/sbin"
else
  export PATH="$TOOLS/node/bin:$TOOLS/uv:$TOOLS/uv/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }
command -v curl >/dev/null || die "curl is required (macOS has it; Linux: sudo apt install curl)."

python_ok() { [[ "${MLP_PRIVATE_TOOLS:-0}" != 1 ]] && command -v python3 >/dev/null && python3 -c 'import sys, venv, ensurepip; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; }
node_ok() { command -v node >/dev/null && command -v npm >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 18 ? 1 : 0)' 2>/dev/null; }

get_uv() {
  command -v uv >/dev/null && return 0
  say "Downloading uv (a private Python installer) into .tools/uv…"
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$TOOLS/uv" INSTALLER_NO_MODIFY_PATH=1 sh >/dev/null
  command -v uv >/dev/null || die "Couldn't install uv. Install Python 3.10+ from https://www.python.org/downloads/ and run this again."
}

get_node() {
  case "$OS-$ARCH" in
    Darwin-arm64) plat=darwin-arm64 ;; Darwin-x86_64) plat=darwin-x64 ;;
    Linux-x86_64) plat=linux-x64 ;; Linux-aarch64|Linux-arm64) plat=linux-arm64 ;;
    *) die "Please install Node.js 18+ from https://nodejs.org (no portable build for $OS-$ARCH)." ;;
  esac
  say "Downloading a private copy of Node.js $NODE_VERSION into .tools/node (used once, to build the interface)…"
  rm -rf "$TOOLS/node" && mkdir -p "$TOOLS/node"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$plat.tar.gz" | tar -xz -C "$TOOLS/node" --strip-components 1
  node_ok || die "The downloaded Node.js doesn't run. Install Node.js 18+ from https://nodejs.org and run this again."
}

# 1. Python environment -------------------------------------------------------------------------------------------
if [[ ! -x .venv/bin/python ]] || ! .venv/bin/python -c 'import fastapi, sklearn, torch' 2>/dev/null; then
  say "Creating the Python environment (a few minutes the first time — PyTorch is big)…"
  rm -rf .venv
  if command -v uv >/dev/null || ! python_ok; then
    get_uv
    uv venv --quiet --python 3.11 .venv
    PIP=(uv pip install --quiet --python .venv/bin/python)
  else
    python3 -m venv .venv
    .venv/bin/python -m pip install --quiet --upgrade pip
    PIP=(.venv/bin/python -m pip install --quiet)
  fi
  if [[ "$OS" == "Linux" && $GPU == 0 ]] && ! command -v nvidia-smi >/dev/null; then
    say "No NVIDIA GPU found — installing the (much smaller) CPU build of PyTorch…"
    "${PIP[@]}" torch --index-url https://download.pytorch.org/whl/cpu
  fi
  "${PIP[@]}" -r requirements.txt
fi

# 2. Interface ----------------------------------------------------------------------------------------------------
node_ok || get_node
say "Building the interface…"
(cd frontend && { npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error; } && npm run build --silent)
[[ -f frontend/dist/index.html ]] || die "The interface build didn't produce frontend/dist/index.html."

# 3. Launchers ----------------------------------------------------------------------------------------------------
if [[ $SHORTCUTS == 0 ]]; then
  echo "Skipping the app icon / desktop entry (--no-shortcuts)."
elif [[ "$OS" == "Darwin" ]]; then
  zsh launcher/build_app.sh >/dev/null && echo "App icon: Desktop, ~/Applications and the project folder."
else
  bash launcher/install_linux.sh
fi

say "ML Playground is installed in $ROOT"
echo "Start it any time from the ML Playground icon, or with:  .venv/bin/python launcher/launch.py"
if [[ $LAUNCH == 1 ]]; then
  .venv/bin/python launcher/launch.py
fi
