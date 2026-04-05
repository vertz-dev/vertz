# Phase 3: Validate Client-Side Module Loading + API Delegation

- **Author:** belo-horizonte
- **Reviewer:** adversarial-reviewer
- **Commits:** (no code changes — validation only)
- **Date:** 2026-04-04

## Changes

No code changes in this phase — purely validation.

## Validation Findings

### Task 1: Client-Side Module Graph — PARTIAL

**Module Compilation:**
- All `.tsx` and `.ts` files compile to valid JavaScript
- **Zero SyntaxErrors** in browser console — the Phase 1 compiler fix is complete
- Fast Refresh runtime injected into all compiled modules
- CSS extracted and injected via `injectCSS()` calls (scoped class names with hash)
- Source maps served correctly (`*.map` files return 200)

**Module Resolution:**
- `/@deps/` prefix resolves node_modules correctly (e.g., `/@deps/@vertz/ui/dist/src/index.js`)
- `#generated` alias resolves to `/.vertz/generated/` correctly
- All entity SDK imports resolve (`projects`, `users`, `comments`, etc.)
- No `Failed to fetch dynamically imported module` errors

**App Rendering:**
- App mounts and begins rendering
- Crashes at `AuthProvider` due to `api.auth` being `undefined` (known issue #2302/#2303)
- Error overlay renders correctly with source location and code context
- No other runtime errors besides the auth SDK issue

**Methodology note:** Validation was performed via manual browser inspection (DevTools console, Network tab, curl) rather than Playwright automation. The AuthProvider crash prevents the app from rendering interactive content, making Playwright assertions impractical beyond basic load checks.

**Console Errors (3 total):**
1. `favicon.ico` 404 — trivial, expected
2. `TypeError: Cannot read properties of undefined (reading 'signIn')` at AuthProvider — #2302
3. `TypeError: Cannot read properties of undefined (reading 'providers')` — same root cause

### Task 2: Navigation and Page Rendering — BLOCKED

Navigation testing is blocked by the AuthProvider crash. The app cannot render past `AuthProvider`, which wraps all routes. This will be unblocked by #2302.

### Task 3: API Route Delegation — FAIL

**Finding:** API routes return `500 Internal Server Error` with `{"error":"Handler error: No handler"}`.

The Rust dev server does not delegate `/api/*` requests to a Bun framework server. It tries to handle them internally but has no handler registered. The Bun dev server runs the full framework server in-process, handling entity CRUD, auth endpoints, etc. The Rust dev server only serves compiled files and SSR — it has no framework handler.

This is a known architectural limitation: the Rust dev server needs either:
1. An API proxy to a running Bun framework server
2. Or the framework handler loaded into the V8 isolate (requires the full server stack)

## Acceptance Criteria Status

- [x] Browser loads the app without `SyntaxError` or module resolution failures
- [x] `#app` div gets child elements (error overlay renders — app attempts to render)
- [ ] `/login` renders with visible OAuth button — **BLOCKED by #2302**
- [ ] Navigation between routes works — **BLOCKED by #2302**
- [ ] `/api/*` requests return valid responses — **FAIL: 500 "No handler"**
- [x] All blocking issues filed (#2302, #2303, #2304)

## Positive Findings

1. **Compiler output is production-quality** — valid JS, no TS leaks, CSS extracted, source maps work
2. **Module resolution is correct** — all import aliases, `/@deps/`, `.vertz/generated/` work
3. **Error overlay works** — shows runtime errors with source-mapped locations and code context
4. **Fast Refresh runtime is injected** — ready for HMR testing once auth is resolved

## Issues

| # | Title | Priority | Area |
|---|-------|----------|------|
| #2302 | AuthProvider crashes during SSR — auth SDK not available | P1 | auth, runtime |
| #2303 | Codegen doesn't generate auth SDK for linear-clone | P2 | codegen, auth |
| #2304 | API route delegation missing in Rust dev server | P2 | runtime |

Note: API delegation issue filed as #2304.
