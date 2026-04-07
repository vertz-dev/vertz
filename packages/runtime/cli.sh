#!/usr/bin/env bash
# vtz — Vertz CLI wrapper.
# Tries the native vtz binary first; falls back to run/exec handling.
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
  exec "$BINARY" "$@"
fi

# Fallback: handle run/exec subcommands without native binary
BIN_PATH="$(pwd)/node_modules/.bin"

case "$1" in
  run)
    shift
    SCRIPT_NAME="$1"
    if [ -z "$SCRIPT_NAME" ]; then
      echo "vtz run: no script name specified" >&2
      exit 1
    fi
    shift
    if [ ! -f package.json ]; then
      echo "vtz run: no package.json found in current directory" >&2
      exit 1
    fi
    CMD=$(sed -n 's/^[[:space:]]*"'"$SCRIPT_NAME"'"[[:space:]]*:[[:space:]]*"\(.*\)"[[:space:]]*,\{0,1\}$/\1/p' package.json | head -1)
    if [ -z "$CMD" ]; then
      echo "vtz run: script not found: \"$SCRIPT_NAME\"" >&2
      exit 1
    fi
    export PATH="$BIN_PATH:$PATH"
    exec sh -c "$CMD $*"
    ;;
  exec)
    shift
    if [ $# -eq 0 ]; then
      echo "vtz exec: no command specified" >&2
      exit 1
    fi
    export PATH="$BIN_PATH:$PATH"
    exec "$@"
    ;;
  *)
    SUB="${1:-}"
    if [ -n "$SUB" ]; then
      echo "vtz: native binary not available and '$SUB' has no fallback." >&2
    else
      echo "vtz: native binary not available and no subcommand specified." >&2
    fi
    echo "Build the native runtime: cd native && cargo build --release" >&2
    exit 1
    ;;
esac
