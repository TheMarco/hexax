#!/bin/bash
# Package Hexax for Mac distribution: cook+build+stage+pak, then fix UE's Mac
# staging gaps (missing runtime dylibs), set the bundle id / name, and sign with
# Developer ID + hardened runtime + secure timestamp (notarization-ready).
#
# Usage: Scripts/package_mac.sh
set -euo pipefail

PROJ="/Users/marcovhv/projects/GIT/hexax/unreal/Hexax"
UPROJECT="$PROJ/Hexax.uproject"
UAT="/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/RunUAT.sh"
ENG="/Users/Shared/Epic Games/UE_5.8/Engine"
DIST="$PROJ/Dist"
SIGN_ID="Developer ID Application: Marco van Hylckama Vlieg (3ML6V62AF5)"
BUNDLE_ID="com.aicreated.hexax"
CONFIG="${1:-Shipping}"   # pass "Development" or "Shipping"

echo ">>> Packaging (Mac $CONFIG)…"
rm -rf "$DIST"
"$UAT" BuildCookRun -project="$UPROJECT" -noP4 -platform=Mac -clientconfig=$CONFIG \
  -cook -build -stage -pak -iostore -nozenstore \
  -map=/Game/Maps/Hexax -nocompileeditor -utf8output -unattended

# IMPORTANT: do NOT use -archive — on Mac it copies only the .app shell and drops
# the staged Contents/UE/.../Paks content, producing a build with no content (no
# window, dies). The STAGED .app is the complete, self-contained one — copy that.
STAGED=$(find "$PROJ/Saved/StagedBuilds/Mac" -maxdepth 1 -name "*.app" | head -1)
APP="$DIST/Mac/Hexax.app"
mkdir -p "$DIST/Mac"
rm -rf "$APP"
cp -R "$STAGED" "$APP"
echo ">>> Assembled self-contained app from staged build: $APP"
DEST="$APP/Contents/MacOS"

echo ">>> Copying runtime dylibs UE failed to stage…"
for lib in libtbb.12.dylib libtbbmalloc.2.dylib libmetalirconverter.dylib libogg.dylib libvorbis.dylib; do
  src=$(find "$ENG" -name "$lib" 2>/dev/null | head -1)
  if [ -n "$src" ]; then cp -L "$src" "$DEST/"; chmod 0755 "$DEST/$lib"; echo "  + $lib"; else echo "  ! missing in engine: $lib"; fi
done

echo ">>> Setting bundle id / name…"
PLIST="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Hexax" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleName string Hexax" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Hexax" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Hexax" "$PLIST"

echo ">>> Renaming to Hexax.app…"
TARGET="$DIST/Mac/Hexax.app"
if [ "$APP" != "$TARGET" ]; then
  rm -rf "$TARGET"
  mv "$APP" "$TARGET"
fi
APP="$TARGET"

echo ">>> Signing (Developer ID, hardened runtime, timestamp)…"
for lib in "$APP/Contents/MacOS/"*.dylib; do
  codesign --force --options runtime --timestamp --sign "$SIGN_ID" "$lib"
done
codesign --force --options runtime --timestamp --sign "$SIGN_ID" "$APP"
codesign --verify --strict "$APP"

echo ">>> DONE: $APP"