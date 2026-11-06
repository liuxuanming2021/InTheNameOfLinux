#!/usr/bin/env bash
# 给 .app 做 ad-hoc 签名，并把 application-identifier 写进 entitlements。
# 为什么需要：不少安装器（TrollStore / 全能签的部分模式）只认带
# application-identifier 的包，纯未签名包会报
#   Application is missing the application-identifier entitlement.
# 这里不需要开发者证书，codesign 用 "-"（ad-hoc）即可把 entitlements 写进二进制。
#
# 用法：bash adhoc-sign.sh <App.app 路径> <输出 ipa 路径>
set -euo pipefail

APP="${1:?需要 App.app 路径}"
OUT="${2:?需要输出 ipa 路径}"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
EXEC="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Info.plist")"
TEAM="$(printf '%s' "$BUNDLE_ID" | md5 -q 2>/dev/null | cut -c1-10 || true)"
TEAM="${TEAM:-NALXER0000}"

ENT="$(mktemp -d)/nalxer.entitlements"
cat > "$ENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>application-identifier</key>
  <string>${TEAM}.${BUNDLE_ID}</string>
  <key>com.apple.developer.team-identifier</key>
  <string>${TEAM}</string>
  <key>get-task-allow</key>
  <false/>
  <key>com.apple.security.get-task-allow</key>
  <false/>
  <key>beta-reports-active</key>
  <false/>
</dict>
</plist>
PLIST

echo "== 签名内嵌 framework / dylib"
if [ -d "$APP/Frameworks" ]; then
  find "$APP/Frameworks" -maxdepth 1 -name '*.framework' -print0 | while IFS= read -r -d '' fw; do
    codesign --force --sign - --timestamp=none "$fw" >/dev/null 2>&1 || echo "跳过 $fw"
  done
  find "$APP/Frameworks" -maxdepth 1 -name '*.dylib' -print0 | while IFS= read -r -d '' dy; do
    codesign --force --sign - --timestamp=none "$dy" >/dev/null 2>&1 || true
  done
fi

echo "== 签名主 App（带 entitlements）"
codesign --force --sign - --timestamp=none --entitlements "$ENT" "$APP"
codesign -dv --entitlements :- "$APP" 2>&1 | head -20 || true

echo "== 校验"
codesign --verify --deep --strict "$APP" && echo "codesign ok"
test -f "$APP/$EXEC" && echo "executable: $EXEC"

echo "== 打包 $OUT"
WORK="$(mktemp -d)"
mkdir -p "$WORK/Payload"
cp -R "$APP" "$WORK/Payload/"
( cd "$WORK" && zip -qry "$OUT" Payload )
unzip -l "$OUT" | head -12
echo "ad-hoc ipa: $OUT"
