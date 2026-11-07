#!/usr/bin/env bash
# Build the clean package that gets uploaded to the Chrome Web Store.
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

version="$(node -p "require('./manifest.json').version")"
package_version="$(node -p "require('./package.json').version")"
if [ "$version" != "$package_version" ]; then
  echo "manifest version $version does not match package.json $package_version" >&2
  exit 1
fi
slug="$(node -p "require('./manifest.json').name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')")"
out="dist/${slug}-${version}.zip"

rm -rf dist
mkdir -p dist

# Runtime files only. Tests, docs and the README are deliberately excluded.
zip -q -r "$out" \
  manifest.json \
  background \
  src \
  popup \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  icons/icon128.png

printf 'built %s\n' "$out"
unzip -l "$out"
