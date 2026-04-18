#!/usr/bin/env bash
# Audit unguarded `window.` / `document.` / `location.` / `history.` references
# in packages that are transitively reachable from server handlers.
#
# After #2760, server handlers run in a clean Worker-like V8 context with no
# browser globals. If a handler imports a module that evaluates `window.foo` at
# module load, it will crash. This script is a trip-wire for accidental new
# references.
#
# The ALLOWLIST below is a snapshot of files that currently reference DOM
# globals. Each entry has been audited for one of:
#   - `typeof window !== 'undefined'` / `typeof document !== 'undefined'` guard
#   - Reference lives inside a function body that only runs in a real browser
#     context (e.g. mount(), client-only components, test utilities)
#   - File is in `src/test/` or `src/__tests__/` (explicitly client-side)
#
# The check is per-file, not per-line: adding a NEW file with any non-comment
# `window.X` match fails the audit. An existing allowlisted file can add more
# refs without tripping the audit — reviewing those belongs in code review.
#
# When a new file in one of the audited packages starts referencing a DOM
# global, CI fails and the author must either:
#   - Move the reference behind a `typeof window !== 'undefined'` guard AND
#     confirm no module-top-level access, then add the file to the allowlist
#     with a justification, or
#   - Refactor so the file no longer touches DOM globals.
#
# Passing the audit does NOT prove a file is correct, only that the set of
# files touching DOM globals has not grown.

set -euo pipefail

PACKAGES=(
  "packages/ui/src"
  "packages/server/src"
  "packages/agents/src"
  "packages/codegen/src"
  "packages/ui-server/src"
)

# Allowlist — files that currently reference DOM globals in non-comment code.
# Each entry is a file that renders safely either because it gates access with
# `typeof window !== 'undefined'` or because it only runs in a browser context
# (mount paths, hydration entrypoints, dev/test utilities).
ALLOWLIST=(
  # Server-side (SSR / access bootstrap — set up DOM globals during SSR)
  "packages/ui-server/src/build-plugin/state-inspector.ts"
  "packages/ui-server/src/dom-shim/index.ts"
  "packages/ui-server/src/node-handler.ts"
  "packages/ui-server/src/ssr-access-set.ts"
  "packages/ui-server/src/ssr-handler.ts"
  "packages/ui-server/src/ssr-html.ts"
  "packages/ui-server/src/ssr-progressive-response.ts"
  "packages/ui-server/src/ssr-session.ts"
  "packages/ui-server/src/ssr-single-pass.ts"
  "packages/ui-server/src/ssr-streaming-runtime.ts"
  "packages/ui-server/src/template-chunk.ts"
  "packages/ui-server/src/template-inject.ts"

  # @vertz/ui — auth/session/access (typeof-guarded or client-only)
  "packages/ui/src/auth/access-event-client.ts"
  "packages/ui/src/auth/auth-context.ts"
  "packages/ui/src/auth/create-access-provider.ts"
  "packages/ui/src/auth/token-refresh.ts"

  # @vertz/ui — component / rendering (client-only execution paths)
  "packages/ui/src/component/children.ts"
  "packages/ui/src/component/default-error-fallback.ts"
  "packages/ui/src/component/presence.ts"
  "packages/ui/src/css/css.ts"
  "packages/ui/src/dialog/dialog-stack.ts"
  "packages/ui/src/dom/dom-adapter.ts"
  "packages/ui/src/dom/element.ts"
  "packages/ui/src/dom/list-value.ts"
  "packages/ui/src/format/relative-time-component.ts"
  "packages/ui/src/hydrate/hydrate.ts"
  "packages/ui/src/hydrate/hydration-context.ts"
  "packages/ui/src/hydrate/island-hydrate.ts"
  "packages/ui/src/image/image.ts"
  "packages/ui/src/island/island.ts"
  "packages/ui/src/jsx-runtime.ts"
  "packages/ui/src/jsx-runtime/index.ts"
  "packages/ui/src/mount.ts"
  "packages/ui/src/ssr/ssr-render-context.ts"

  # @vertz/ui — query / router (typeof-guarded)
  "packages/ui/src/query/query.ts"
  "packages/ui/src/query/ssr-hydration.ts"
  "packages/ui/src/router/link.ts"
  "packages/ui/src/router/navigate.ts"
  "packages/ui/src/router/reactive-search-params.ts"
  "packages/ui/src/router/server-nav.ts"
  "packages/ui/src/router/view-transitions.ts"

  # @vertz/ui — test utilities (never imported by server handlers)
  "packages/ui/src/test/interactions.ts"
  "packages/ui/src/test/queries.ts"
  "packages/ui/src/test/render-test.ts"
  "packages/ui/src/test/test-router.ts"
)

PATTERN='(^|[^A-Za-z_.$])(window|document|location|history)\.'

declare -A ALLOWED
for f in "${ALLOWLIST[@]}"; do
  ALLOWED["$f"]=1
done

# Match line. Returns 0 (true) if the match at $line is a non-comment hit.
# Filters out lines that are:
#   - entirely a `//` single-line comment
#   - block-comment continuation lines starting with `*` (JSDoc, /* ... */)
#   - lines where the DOM ref only appears after a `//` comment marker
is_real_hit() {
  local line="$1"
  # Strip leading whitespace
  local trimmed="${line#"${line%%[![:space:]]*}"}"
  # Lines starting with //, *, /*, or /** are comments.
  case "$trimmed" in
    //*|'*'*|'/*'*) return 1 ;;
  esac
  # If the match appears only AFTER a // on the same line, treat as comment
  local before_comment="${line%%//*}"
  if [[ "$before_comment" != "$line" ]]; then
    if ! echo "$before_comment" | grep -qE "$PATTERN"; then
      return 1
    fi
  fi
  return 0
}

declare -A OFFENDERS=()

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  rest="${hit#*:}"
  # rest is LINENO:CONTENT
  content="${rest#*:}"

  if [[ -n "${ALLOWED[$file]:-}" ]]; then
    continue
  fi
  case "$file" in
    *.test.ts|*.test-d.ts|*.test.tsx) continue ;;
  esac
  if is_real_hit "$content"; then
    OFFENDERS["$file"]=1
  fi
done < <(grep -rnE "$PATTERN" "${PACKAGES[@]}" \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=__tests__ --exclude-dir=node_modules \
  2>/dev/null || true)

offender_count=${#OFFENDERS[@]}
if [ "$offender_count" -gt 0 ]; then
  echo "::error::New handler-reachable DOM references found:"
  for file in "${!OFFENDERS[@]}"; do
    echo "  $file"
  done | sort
  echo ""
  echo "Server handlers run in a Worker-like V8 context without 'window',"
  echo "'document', 'location', or 'history'. Any module evaluated at load"
  echo "time that touches these globals will crash the handler."
  echo ""
  echo "Options:"
  echo "  1. Refactor the file so it doesn't reference DOM globals."
  echo "  2. Ensure every reference is behind a 'typeof window !== \"undefined\"'"
  echo "     guard (or lives inside a function only called in the browser),"
  echo "     then add the file to the ALLOWLIST in"
  echo "     scripts/audit-window-document-refs.sh with a one-line rationale."
  exit 1
fi

echo "Handler-reachable DOM reference audit: OK"
