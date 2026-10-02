#!/bin/zsh
# Build "ML Playground.app" and place it in ~/Applications, on the Desktop and in the project folder.
set -e
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="ML Playground.app"
BUILD="$PROJECT/launcher/build/$NAME"

if [[ ! -f "$PROJECT/launcher/AppIcon.icns" ]]; then
  "$PROJECT/.venv/bin/python" "$PROJECT/launcher/make_icon.py" "$PROJECT/launcher"
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/Contents/MacOS" "$BUILD/Contents/Resources"
cp "$PROJECT/launcher/Info.plist" "$BUILD/Contents/Info.plist"
cp "$PROJECT/launcher/AppIcon.icns" "$BUILD/Contents/Resources/AppIcon.icns"
sed "s|__PROJECT__|$PROJECT|" "$PROJECT/launcher/launch.sh" > "$BUILD/Contents/MacOS/launch"
chmod +x "$BUILD/Contents/MacOS/launch"
codesign --force --deep -s - "$BUILD" >/dev/null 2>&1 || true

LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
for dest in "$HOME/Applications" "$HOME/Desktop" "$PROJECT"; do
  mkdir -p "$dest"
  rm -rf "$dest/$NAME"
  cp -R "$BUILD" "$dest/$NAME"
  touch "$dest/$NAME"
  [[ -x $LSREG ]] && $LSREG -f "$dest/$NAME" >/dev/null 2>&1 || true
  echo "installed: $dest/$NAME"
done
