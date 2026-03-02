#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Benchmark Setup ==="
echo

# 1. Build Vertz monorepo packages (prerequisite for CLI)
echo "Building Vertz monorepo packages..."
cd "$ROOT_DIR"
bun run build
echo "  Done."
echo

# 2. Generate benchmark apps
echo "Generating benchmark apps..."
node "$SCRIPT_DIR/generate-app.mjs"
echo

# 3. Install vinext dependencies (npm, NOT bun — intentional isolation)
echo "Installing vinext dependencies (npm)..."
cd "$SCRIPT_DIR/vinext"
npm install
echo "  Done."
echo

echo "=== Setup complete ==="
echo "Run benchmarks with: node benchmarks/run.mjs"
