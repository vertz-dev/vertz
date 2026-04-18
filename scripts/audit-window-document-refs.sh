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
# When a new file in one of the audited packages starts referencing a DOM
# global, CI fails and the author must either:
#   - Add a typeof guard (preferred), or
#   - Explicitly add the file to this allowlist after reviewing why it's safe.
#
# This is intentionally conservative: passing the audit does NOT prove a file
# is correct, only that the set of files touching DOM globals has not grown.

set -euo pipefail

PACKAGES=(
  "packages/ui/src"
  "packages/server/src"
  "packages/agents/src"
  "packages/codegen/src"
  "packages/ui-server/src"
)

# Allowlist — files known to reference DOM globals today. Each one must be
# either guarded (typeof check) or reachable only from client/test contexts.
# When in doubt, prefer adding a `typeof` guard and leaving the file out.
ALLOWLIST=(
  # Server-side (SSR / access bootstrap — setups global references during SSR)
  "packages/server/src/auth/db-subscription-store.ts"
  "packages/server/src/auth/resolve-session-for-ssr.ts"
  "packages/server/src/create-server.ts"
  "packages/ui-server/src/build-plugin/state-inspector.ts"
  "packages/ui-server/src/dom-shim/index.ts"
  "packages/ui-server/src/node-handler.ts"
  "packages/ui-server/src/ssr-access-set.ts"
  "packages/ui-server/src/ssr-aot-pipeline.ts"
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

# Build a set for fast lookup
declare -A ALLOWED
for f in "${ALLOWLIST[@]}"; do
  ALLOWED["$f"]=1
done

hits=""
while IFS= read -r file; do
  # Skip allowlisted files
  if [[ -n "${ALLOWED[$file]:-}" ]]; then
    continue
  fi
  # Skip test files (matched by name suffix)
  case "$file" in
    *.test.ts|*.test-d.ts|*.test.tsx) continue ;;
  esac
  hits+="$file"$'\n'
done < <(grep -rlE "$PATTERN" "${PACKAGES[@]}" \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=__tests__ --exclude-dir=node_modules \
  2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "::error::New handler-reachable DOM references found:"
  echo "$hits" | sed 's/^/  /'
  echo ""
  echo "Either:"
  echo "  1. Gate the reference with 'typeof window !== \"undefined\"' (preferred), or"
  echo "  2. After reviewing why the file is safe, add it to the ALLOWLIST in"
  echo "     scripts/audit-window-document-refs.sh."
  exit 1
fi

echo "Handler-reachable DOM reference audit: OK"
