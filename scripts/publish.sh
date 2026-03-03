#!/usr/bin/env bash
set -euo pipefail

# Publish all public packages using `bun publish`, which resolves workspace:*
# to actual version numbers at publish time. Falls back gracefully if a version
# is already published (changeset publish would do the same).

FAILED=()

for pkg_json in packages/*/package.json; do
  dir=$(dirname "$pkg_json")
  name=$(jq -r '.name' "$pkg_json")
  version=$(jq -r '.version' "$pkg_json")
  private=$(jq -r '.private // false' "$pkg_json")

  if [ "$private" = "true" ]; then
    echo "⏭️  Skipping $name (private)"
    continue
  fi

  # Check if already published
  published=$(npm view "$name@$version" version 2>/dev/null || echo "")
  if [ "$published" = "$version" ]; then
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
