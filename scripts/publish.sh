#!/usr/bin/env bash
set -euo pipefail

# Publish all public packages. Three-tier publishing:
# 1. Runtime binary packages (packages/runtime-*) — npm publish --provenance
# 2. Runtime selector package (packages/runtime) — npm publish --provenance
# 3. Source packages (all other public packages) — vtz publish

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

# --- Phase 1: Publish runtime binary packages (packages/runtime-*) ---
echo "=== Publishing runtime binary packages ==="

for pkg_json in packages/runtime-*/package.json; do
  [ -f "$pkg_json" ] || continue

  dir=$(dirname "$pkg_json")
  name=$(jq -r '.name' "$pkg_json")
  version=$(jq -r '.version' "$pkg_json")
  private=$(jq -r '.private // false' "$pkg_json")

  if [ "$private" = "true" ]; then
    if [ ! -f "$dir/vtz" ]; then
      echo "Skipping $name (no binary)"
      continue
    fi

    # Temporarily remove private flag for publishing
    jq 'del(.private)' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"
    MODIFIED_PKGS+=("$pkg_json")
  fi

  if is_published "$name" "$version"; then
    echo "Skipping $name@$version (already published)"
    continue
  fi

  echo "Publishing $name@$version..."
  if (cd "$dir" && npm publish --access public --provenance); then
    echo "Published $name@$version"
  else
    echo "Failed to publish $name@$version"
    FAILED+=("$name@$version")
  fi
done

# --- Phase 2: Publish selector package (packages/runtime) ---
echo ""
echo "=== Publishing runtime selector package ==="

name=$(jq -r '.name' packages/runtime/package.json)
version=$(jq -r '.version' packages/runtime/package.json)

if is_published "$name" "$version"; then
  echo "Skipping $name@$version (already published)"
else
  echo "Publishing $name@$version..."
  if (cd packages/runtime && npm publish --access public --provenance); then
    echo "Published $name@$version"
  else
    echo "Failed to publish $name@$version"
    FAILED+=("$name@$version")
  fi
fi

# --- Phase 3: Publish source packages ---
echo ""
echo "=== Publishing source packages ==="

for pkg_json in packages/*/package.json; do
  dir=$(dirname "$pkg_json")
  name=$(jq -r '.name' "$pkg_json")
  version=$(jq -r '.version' "$pkg_json")
  private=$(jq -r '.private // false' "$pkg_json")

  # Skip private, runtime (already published above), and runtime-* packages
  if [ "$private" = "true" ]; then
    continue
  fi

  base=$(basename "$dir")
  if [[ "$base" == runtime || "$base" == runtime-* ]]; then
    continue
  fi

  if is_published "$name" "$version"; then
    echo "Skipping $name@$version (already published)"
    continue
  fi

  echo "Publishing $name@$version..."
  if (cd "$dir" && vtz publish --access public); then
    echo "Published $name@$version"
  else
    echo "Failed to publish $name@$version"
    FAILED+=("$name@$version")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "Failed to publish:"
  for pkg in "${FAILED[@]}"; do
    echo "  - $pkg"
  done
  exit 1
fi

echo ""
echo "All packages published successfully"

# Create git tags (changeset tag)
bunx changeset tag 2>/dev/null || true
