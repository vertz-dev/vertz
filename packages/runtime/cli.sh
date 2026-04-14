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
    # Try system-installed vtz before giving up:
    # 1. Check ~/.vtz/bin/vtz (standard install location)
    if [ -x "$HOME/.vtz/bin/vtz" ]; then
      exec "$HOME/.vtz/bin/vtz" "$@"
    fi

    # 2. Walk PATH to find a non-self vtz binary.
    #    `command -v` only returns the first match, which may be a symlink back
    #    to this script (e.g. node_modules/.bin/vtz in a nested invocation).
    #    We resolve symlinks on each candidate to detect self-references.
    SELF_REAL="$PKG_DIR/$(basename "$SOURCE")"
    _path_rest="$PATH"
    while [ -n "$_path_rest" ]; do
      _dir="${_path_rest%%:*}"
      if [ "$_path_rest" = "$_dir" ]; then
        _path_rest=""
      else
        _path_rest="${_path_rest#*:}"
      fi
      [ -z "$_dir" ] && continue
      [ -x "$_dir/vtz" ] || continue
      # Resolve symlinks on the candidate
      _cand="$_dir/vtz"
      while [ -L "$_cand" ]; do
        _cand_dir="$(cd "$(dirname "$_cand")" 2>/dev/null && pwd)" || break
        _cand="$(readlink "$_cand")"
        [[ "$_cand" != /* ]] && _cand="$_cand_dir/$_cand"
      done
      _cand_real="$(cd "$(dirname "$_cand")" 2>/dev/null && pwd)/$(basename "$_cand")" 2>/dev/null || continue
      if [ "$_cand_real" != "$SELF_REAL" ]; then
        exec "$_dir/vtz" "$@"
      fi
    done

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
