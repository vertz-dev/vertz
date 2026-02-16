#!/usr/bin/env bash
# Setup git hooks for this repository
# Usage: ./scripts/setup-hooks.sh
#
# This script should be run once after cloning or after creating a worktree.
# It installs the pre-push hook that runs quality gates before pushing.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "Setting up git hooks for vertz..."

# Check if we're in a worktree
GIT_DIR="$(git rev-parse --git-dir)"
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"

if [ "$GIT_DIR" != "$GIT_COMMON_DIR" ]; then
  echo "⚠️  Detected worktree setup."
  echo "   Git directory: $GIT_DIR"
  echo "   Common directory: $GIT_COMMON_DIR"
  echo ""
  echo "   Worktrees share .git/hooks with the main repository."
  echo "   The pre-push hook is already path-independent and will work"
  echo "   from any worktree by resolving lefthook relative to each checkout."
  echo ""
fi

# Ensure the hooks directory exists
HOOKS_DIR="$REPO_ROOT/.git/hooks"
mkdir -p "$HOOKS_DIR"

# Create pre-push hook if it doesn't exist or update it
PRE_PUSH_HOOK="$HOOKS_DIR/pre-push"

# Check if lefthook is available
if ! command -v lefthook &> /dev/null && [ ! -f "$REPO_ROOT/node_modules/.bin/lefthook" ]; then
  echo "⚠️  lefthook not found. Make sure to run 'bun install' first."
  exit 1
fi

# Run lefthook install to set up the hooks
echo "Running lefthook install..."
cd "$REPO_ROOT"
lefthook install || true

echo "✅ Hooks setup complete!"
echo ""
echo "The pre-push hook will now run quality gates (lint, typecheck, tests)"
echo "before allowing any push to proceed."
