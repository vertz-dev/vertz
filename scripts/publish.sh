#!/usr/bin/env bash
set -euo pipefail

# Publish all public packages. Two-tier publishing:
# 1. Runtime binary packages (npm/) — `npm publish --provenance` for supply chain attestation
# 2. Source packages (packages/) — `bun publish` which resolves workspace:* protocols

FAILED=()
MODIFIED_PKGS=()

# Cleanup: restore "private" field in any package.json we modified
cleanup_private() {
  for pkg_json in "${MODIFIED_PKGS[@]}"; do
    if [ -f "$pkg_json" ]; then
      jq '. + {"private": true}' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"
    fi
  done
}
trap cleanup_private EXIT

# Helper: check if a version is already published
is_published() {
  local name=$1 version=$2
  local published
  published=$(npm view "$name@$version" version 2>/dev/null || echo "")
  [ "$published" = "$version" ]
}

# --- Phase 1: Publish runtime binary packages (npm/) with provenance ---
echo "=== Publishing runtime binary packages ==="

# Platform packages first, then parent (@vertz/runtime)
for pkg_json in npm/runtime-*/package.json npm/runtime/package.json; do
  [ -f "$pkg_json" ] || continue

  dir=$(dirname "$pkg_json")
  name=$(jq -r '.name' "$pkg_json")
  version=$(jq -r '.version' "$pkg_json")
  private=$(jq -r '.private // false' "$pkg_json")

  if [ "$private" = "true" ]; then
    # Platform packages are private in monorepo but published by CI.
    # Check if the package has a binary to publish.
    if [ ! -f "$dir/vertz-runtime" ] && [ "$name" != "@vertz/runtime" ]; then
      echo "⏭️  Skipping $name (no binary)"
      continue
    fi

    # For CI publishing, temporarily remove private flag (restored by EXIT trap)
    if [ -f "$dir/vertz-runtime" ]; then
      jq 'del(.private)' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"
      MODIFIED_PKGS+=("$pkg_json")
    else
      echo "⏭️  Skipping $name (private, no binary)"
      continue
    fi
  fi

  if is_published "$name" "$version"; then
    echo "⏭️  Skipping $name@$version (already published)"
    continue
  fi

  echo "📦 Publishing $name@$version (npm --provenance)..."
  if (cd "$dir" && npm publish --access public --provenance); then
    echo "✅ Published $name@$version"
  else
    echo "❌ Failed to publish $name@$version"
    FAILED+=("$name@$version")
  fi
done

# --- Phase 2: Publish source packages (packages/) with bun ---
echo ""
echo "=== Publishing source packages ==="

for pkg_json in packages/*/package.json; do
  dir=$(dirname "$pkg_json")
  name=$(jq -r '.name' "$pkg_json")
  version=$(jq -r '.version' "$pkg_json")
  private=$(jq -r '.private // false' "$pkg_json")

  if [ "$private" = "true" ]; then
    echo "⏭️  Skipping $name (private)"
    continue
  fi

  if is_published "$name" "$version"; then
    echo "⏭️  Skipping $name@$version (already published)"
    continue
  fi

  echo "📦 Publishing $name@$version..."
  if (cd "$dir" && bun publish --access public); then
    echo "✅ Published $name@$version"
  else
    echo "❌ Failed to publish $name@$version"
    FAILED+=("$name@$version")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌ Failed to publish:"
  for pkg in "${FAILED[@]}"; do
    echo "  - $pkg"
  done
  exit 1
fi

echo ""
echo "✅ All packages published successfully"

# Create git tags (changeset tag)
bunx changeset tag 2>/dev/null || true
