# Coverage Hardening: ui-server (ssr-render.ts + bun-dev-server.ts)

## Current State

| File | Lines | Functions | Target |
|------|-------|-----------|--------|
| `ssr-render.ts` | 95.61% | 97.30% | ~99% |
| `bun-dev-server.ts` | 45.16% | 71.70% | 90%+ |

## Phase 1: ssr-render.ts error paths (4 tests)

Uncovered lines: 108, 199-202, 353-355, 491-495

1. `resolveAppFactory` throws on missing export (line 108)
2. `compileTheme()` failure caught and logged (lines 199-202)
3. `ssrDiscoverQueries` timeout race — timed-out query in pending (lines 353-355)
4. `ssrStreamNavQueries` query rejection silently dropped (lines 491-495)

## Phase 2: detectEditor, editorHrefJs, killStaleProcess (11 tests)

Export and test private utility functions (lines 218-234, 286-304).

## Phase 3: OpenAPI, parseSourceFromStack, terminal logging (9 tests)

Cover OpenAPI spec loading/serving, stack trace parsing, runtime error logging.

## Phase 4: console.error override deeper branches (8 tests)

HMR error parsing, frontend error parsing, stack-based source resolution, deduplication.

## Phase 5: broadcastError runtime debounce & auto-restart cap (6 tests)

Debounce timer, auto-restart cap after 3 stale-graph errors, cap window expiry.

## Phase 6: Integration tests — HTTP, WebSocket, lifecycle (12 tests)

Real Bun.serve() on random port. SSR HTML, diagnostics, build check, WS error channel, restart/stop.

## Total: ~50 tests → ssr-render ~99%, bun-dev-server 90%+
