#!/usr/bin/env bash
set -euo pipefail

# Run changeset version to bump npm package versions
bunx changeset version

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
    sed -i "s/^version = \".*\"/version = \"$VERSION\"/" "$cargo_toml"
  fi
done

# Sync runtime package versions (optionalDependencies in selector)
jq --arg v "$VERSION" '.optionalDependencies |= with_entries(.value = $v)' \
  packages/runtime/package.json > packages/runtime/package.json.tmp \
  && mv packages/runtime/package.json.tmp packages/runtime/package.json

echo "All versions synced to $VERSION"
