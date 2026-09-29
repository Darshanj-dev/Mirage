#!/usr/bin/env bash
# Builds and signs MIRAGE.app.
#   desktop/scripts/build-app.sh            -> desktop/build/MIRAGE.app
# Signing: the first "Apple Development" / "Developer ID Application" identity, or MIRAGE_SIGN_ID.
# A stable signature matters: macOS ties the Accessibility permission to it, so ad-hoc builds
# lose the permission on every rebuild.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
SCRATCH="${MIRAGE_SCRATCH:-${TMPDIR:-/tmp}/mirage-desktop-build}"
APP="$SCRATCH/app/MIRAGE.app" # assembled and signed outside ~/Desktop, whose attributes codesign rejects
OUT="build/MIRAGE.app"

echo "› core: npm run build:core"
(cd "$ROOT" && npm run --silent build:core >/dev/null)

echo "› swift build (release)"
swift build -c release --scratch-path "$SCRATCH" --product MIRAGE

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$SCRATCH/release/MIRAGE" "$APP/Contents/MacOS/MIRAGE"
cp Sources/MirageCore/Resources/mirage-core.js "$APP/Contents/Resources/"
cp Support/Info.plist "$APP/Contents/Info.plist"
xattr -cr "$APP" # folders like ~/Desktop add attributes codesign rejects

LINE="$(security find-identity -v -p codesigning | grep -E 'Developer ID Application|Apple Development' | head -1)"
ID="${MIRAGE_SIGN_ID:-$(echo "$LINE" | sed -E 's/.*"(.*)"/\1/')}"
if [ -z "$ID" ]; then
  echo "› no signing identity: ad-hoc signing (Accessibility must be re-granted after each build)"
  codesign --force --options runtime --timestamp=none --sign - "$APP"
else
  # Pin the designated requirement to this certificate. Without it, codesign may fall back to
  # the build's hash (when Apple's intermediate certificate isn't in the keychain), and macOS
  # then treats every rebuild as a new app and drops its Accessibility permission.
  LEAF="${MIRAGE_SIGN_SHA1:-$(echo "$LINE" | awk '{print $2}')}"
  REQ="designated => identifier \"dev.mirage.desktop\" and certificate leaf = H\"$LEAF\""
  echo "› codesign: $ID (hardened runtime, no extra entitlements, requirement pinned to certificate)"
  codesign --force --options runtime --timestamp=none --sign "$ID" -r="$REQ" "$APP"
fi
codesign --verify --strict "$APP"
rm -rf "$OUT"
mkdir -p build
ditto --norsrc --noextattr "$APP" "$OUT"
codesign --verify "$OUT"
echo "✓ $OUT ($(codesign -d -r- "$OUT" 2>&1 | grep -o 'certificate leaf\|cdhash'))"
