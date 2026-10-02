#!/usr/bin/env bash
# One-line install for macOS and Linux (needs only bash, curl and tar):
#
#   curl -fsSL https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.sh | bash
#
# Options (pass after `bash -s --`):  --dir PATH (default ~/MLSimulator)  --no-launch  --gpu
#   curl -fsSL https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.sh | bash -s -- --no-launch
# Running it again updates an existing install (your projects in data/ are kept).
set -euo pipefail
REPO="GilCaplan/MLSimulator"
BRANCH="main"
DIR="${MLP_DIR:-$HOME/MLSimulator}"
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

git_ok() {
  command -v git >/dev/null || return 1
  # macOS ships a /usr/bin/git stub that pops up an installer unless the Command Line Tools are present
  [[ "$(uname -s)" != "Darwin" ]] || xcode-select -p >/dev/null 2>&1
}

if [[ -d "$DIR/.git" ]] && git_ok; then
  say "Updating $DIR…"
  git -C "$DIR" pull --ff-only
elif [[ ! -e "$DIR" ]] && git_ok; then
  say "Downloading ML Playground into $DIR…"
  git clone --depth 1 -b "$BRANCH" "https://github.com/$REPO.git" "$DIR"
else
  say "Downloading ML Playground into $DIR…"
  mkdir -p "$DIR"
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$DIR" --strip-components 1
fi
exec bash "$DIR/scripts/setup.sh" ${ARGS[@]+"${ARGS[@]}"}
