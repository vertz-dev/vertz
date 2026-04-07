#!/usr/bin/env bash
# Link the local vtz runtime binary for monorepo development.
#
# Usage: ./scripts/link-runtime.sh [--build]
#
# Bun workspaces don't auto-link workspace package bins to node_modules/.bin/.
# This script creates the symlinks so `vtz`, `vertz`, and `vtzx` resolve to the
# locally-built binary.
#
# With --build: also builds the binary from source (cargo build --release).
# Without --build: copies the existing release binary if available, or uses the
# platform package binary as-is.
#
# When the native binary isn't available (e.g. CI), creates lightweight shell
# shims that delegate to the Node.js scripts so package scripts still work.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

# Normalize arch name to match package names
case "$ARCH" in
  aarch64|arm64) ARCH="arm64" ;;
  x86_64)        ARCH="x64" ;;
esac

PLATFORM_PKG="$REPO_ROOT/packages/runtime-${PLATFORM}-${ARCH}"
RUNTIME_PKG="$REPO_ROOT/packages/runtime"
RELEASE_BIN="$REPO_ROOT/native/target/release/vtz"
BIN_DIR="$REPO_ROOT/node_modules/.bin"

if [ ! -d "$PLATFORM_PKG" ]; then
  echo "❌ No platform package for ${PLATFORM}-${ARCH}"
  exit 1
fi

# Build from source if --build flag is passed
if [ "$1" = "--build" ]; then
  echo "Building vtz from source..."
  cd "$REPO_ROOT/native"
  cargo build -p vtz --release
  echo "✅ Built: $RELEASE_BIN"
fi

# Copy release binary to platform package if it exists
if [ -f "$RELEASE_BIN" ]; then
  cp "$RELEASE_BIN" "$PLATFORM_PKG/vtz"
  chmod +x "$PLATFORM_PKG/vtz"
  echo "✅ Copied release binary to $PLATFORM_PKG/vtz"
fi

mkdir -p "$BIN_DIR"

# Check if the platform binary exists (either built or pre-existing)
if [ -f "$PLATFORM_PKG/vtz" ]; then
  # Native binary available — symlink everything to it
  ln -sf "../runtime-${PLATFORM}-${ARCH}/vtz" "$RUNTIME_PKG/vtz"
  echo "✅ Linked runtime/vtz → runtime-${PLATFORM}-${ARCH}/vtz"

  for cmd in vtz vertz vtzx; do
    ln -sf "../../packages/runtime/vtz" "$BIN_DIR/$cmd"
  done
  echo "✅ Linked node_modules/.bin/{vtz,vertz,vtzx}"

  VERSION="$("$BIN_DIR/vtz" --version 2>/dev/null || echo "unknown")"
  echo ""
  echo "Runtime ready: $VERSION"
else
  # No native binary — create shell shims for CI/dev-without-binary
  # Remove existing symlinks first to avoid overwriting source files via symlink follow
  for cmd in vtz vertz vtzx; do
    rm -f "$BIN_DIR/$cmd"
  done

  # Symlink to the bash scripts — they handle the fallback internally
  for cmd in vtz vertz; do
    ln -sf "../../packages/runtime/cli.sh" "$BIN_DIR/$cmd"
  done
  ln -sf "../../packages/runtime/cli-exec.sh" "$BIN_DIR/vtzx"

  echo "⚠️  No native binary found — using fallback shell scripts for vtz/vtzx"
  echo "   (Build with: ./scripts/link-runtime.sh --build)"
fi
