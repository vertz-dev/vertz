#!/bin/bash
set -euo pipefail

# Pre-push quality gate — mirrors GitHub CI exactly.
# Run this before every push. If it fails, don't push.
#
# Usage: bash scripts/pre-push.sh

echo "🔒 Running pre-push quality gate..."
echo ""

# Ensure Postgres is running (integration tests need it)
if ! pg_isready -h localhost -p 5432 -U postgres &>/dev/null; then
  echo "▶ Starting Postgres (docker compose up -d)..."
  docker compose up -d --wait
  echo ""
fi

export DATABASE_TEST_URL=postgres://postgres:postgres@localhost:5432/vertz_test

# Runs: turbo run lint build typecheck test (excludes examples)
echo "▶ Running: bun run ci"
bun run ci

echo ""
echo "✅ All quality gates passed. Safe to push."
