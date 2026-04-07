#!/usr/bin/env bash
# vtzx — execute a command with node_modules/.bin on PATH.
# Tries the native vtz binary first; falls back to PATH-based resolution.
set -e

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in aarch64|arm64) ARCH="arm64" ;; x86_64) ARCH="x64" ;; esac

# Resolve the real directory of this script (follows symlinks)
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
PKG_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

# Try native binary (sibling platform package)
BINARY="$PKG_DIR/../runtime-${OS}-${ARCH}/vtz"
if [ -x "$BINARY" ]; then
  exec "$BINARY" exec "$@"
fi

# Fallback: prepend node_modules/.bin to PATH and run the command
if [ $# -eq 0 ]; then
  echo "vtzx: no command specified" >&2
  exit 1
fi
export PATH="$(pwd)/node_modules/.bin:$PATH"
exec "$@"
