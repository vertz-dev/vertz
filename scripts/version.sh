#!/usr/bin/env bash
set -euo pipefail

# Ensure node_modules/.bin is on PATH (changesets action may not inherit GITHUB_PATH)
export PATH="$PWD/node_modules/.bin:$PATH"

# Run changeset version to bump npm package versions
changeset version

# Read the new version from a source package (source of truth after changeset version)
VERSION=$(jq -r '.version' packages/core/package.json)

echo "Syncing version $VERSION to Cargo.toml and version.txt..."

# Sync to version.txt
echo "$VERSION" > version.txt

# Sync to Cargo.toml files
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for cargo_toml in "$REPO_ROOT"/native/vtz/Cargo.toml \
                  "$REPO_ROOT"/native/vertz-compiler/Cargo.toml \
                  "$REPO_ROOT"/native/vertz-compiler-core/Cargo.toml; do
  if [ -f "$cargo_toml" ]; then
    sed "s/^version = \".*\"/version = \"$VERSION\"/" "$cargo_toml" > "${cargo_toml}.tmp" && mv "${cargo_toml}.tmp" "$cargo_toml"
  fi
done

# Sync runtime package versions (optionalDependencies in selector)
jq --arg v "$VERSION" '.optionalDependencies |= with_entries(.value = $v)' \
  packages/runtime/package.json > packages/runtime/package.json.tmp \
  && mv packages/runtime/package.json.tmp packages/runtime/package.json

# Sync native-compiler selector package version
jq --arg v "$VERSION" '.version = $v' \
  native/vertz-compiler/package.json > native/vertz-compiler/package.json.tmp \
  && mv native/vertz-compiler/package.json.tmp native/vertz-compiler/package.json

# Sync native-compiler platform package versions
for pkg_json in packages/native-compiler-*/package.json; do
  if [ -f "$pkg_json" ]; then
    jq --arg v "$VERSION" '.version = $v' "$pkg_json" > "$pkg_json.tmp" \
      && mv "$pkg_json.tmp" "$pkg_json"
  fi
done

# Sync native-compiler optionalDependencies
jq --arg v "$VERSION" '.optionalDependencies |= with_entries(.value = $v)' \
  native/vertz-compiler/package.json > native/vertz-compiler/package.json.tmp \
  && mv native/vertz-compiler/package.json.tmp native/vertz-compiler/package.json

echo "All versions synced to $VERSION"
