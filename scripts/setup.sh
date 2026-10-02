#!/bin/zsh
# One-shot setup: Python env, interface build, app icon/launchers.
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
if [[ ! -x .venv/bin/python ]]; then
  if command -v uv >/dev/null; then uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements.txt
  else python3 -m venv .venv && .venv/bin/pip install -r requirements.txt; fi
fi
(cd frontend && (npm ci || npm install) && npm run build)
zsh launcher/build_app.sh
echo "Done. Double-click 'ML Playground' on your Desktop or in ~/Applications."
