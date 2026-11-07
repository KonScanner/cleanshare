#!/usr/bin/env bash
# Build the clean package that gets uploaded to addons.mozilla.org (AMO).
#
# It also leaves an unpacked copy in dist/firefox/ for about:debugging.
set -euo pipefail

cd "$(dirname "$0")/.."

command -v zip >/dev/null 2>&1 || {
  echo "zip is required" >&2
  exit 1
}

command -v unzip >/dev/null 2>&1 || {
  echo "unzip is required" >&2
  exit 1
}

node scripts/check-manifests.mjs

version="$(node -p "require('./manifest.firefox.json').version")"
slug="$(node -p "require('./manifest.firefox.json').name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')")"
out_dir="dist/firefox"
out="dist/${slug}-firefox-${version}.zip"
out_abs="$PWD/$out"

rm -rf "$out_dir" "$out"
mkdir -p "$out_dir/icons"

# AMO expects manifest.json at the archive root, so the Firefox manifest is
# installed under that name. Only runtime files are copied.
cp manifest.firefox.json "$out_dir/manifest.json"
cp -R background src popup "$out_dir/"
cp icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png \
  "$out_dir/icons/"
cp LICENSE "$out_dir/LICENSE"

(
  cd "$out_dir"
  zip -q -r "$out_abs" \
    manifest.json \
    background \
    src \
    popup \
    icons \
    LICENSE
)

printf 'built %s\n' "$out"
printf 'unpacked copy: %s (load it from about:debugging)\n' "$out_dir"
unzip -l "$out"
