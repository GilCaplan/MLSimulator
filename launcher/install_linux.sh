#!/usr/bin/env bash
# Linux: add an "ML Playground" entry to the applications menu, the Desktop and the project folder.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="[Desktop Entry]
Type=Application
Name=ML Playground
Comment=Machine learning as a playground
Exec=\"$ROOT/.venv/bin/python\" \"$ROOT/launcher/launch.py\"
Path=$ROOT
Icon=$ROOT/launcher/icon.png
Terminal=false
Categories=Education;Science;
"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS"
printf '%s' "$ENTRY" > "$APPS/ml-playground.desktop"
printf '%s' "$ENTRY" > "$ROOT/ML Playground.desktop"
chmod +x "$APPS/ml-playground.desktop" "$ROOT/ML Playground.desktop"
DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [[ -d "$DESKTOP" ]]; then
  cp "$APPS/ml-playground.desktop" "$DESKTOP/ml-playground.desktop"
  chmod +x "$DESKTOP/ml-playground.desktop"
  command -v gio >/dev/null && gio set "$DESKTOP/ml-playground.desktop" metadata::trusted true 2>/dev/null || true
fi
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true
echo "Installed the ML Playground launcher (applications menu, Desktop, project folder)."
