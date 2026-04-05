# Linear Example Validation Report — Rust Dev Server

**Date:** 2026-04-04
**Server:** vtz dev (native/vtz/) v0.2.47
**Target:** examples/linear/

## Summary

The Rust dev server successfully compiles the full linear-clone example, serves all modules to the browser, and provides working HMR + error overlay. SSR is blocked by a pre-existing AuthProvider issue, and API routes are not delegated. One compiler bug was found and fixed (P0).

## Feature Areas

### Server Startup
- **Status:** PASS
- **Notes:** Startup in 2-4ms. SSR module loaded, ssrRenderSinglePass imported. All 150+ modules served without errors.

### Module Compilation (Client)
- **Status:** PASS
- **Notes:** All `.tsx` and `.ts` files compile to valid JavaScript. Zero SyntaxErrors in browser. CSS extracted with scoped class names. Fast Refresh runtime injected. Source maps served correctly. The Phase 1 fix (commit c1f1a98db) resolved the TS type annotation leak in props transform.

### Module Resolution
- **Status:** PASS
- **Notes:** `/@deps/` prefix resolves node_modules correctly. `#generated` alias maps to `.vertz/generated/`. All entity SDKs, schema imports, UI primitives, and theme packages resolve. No `Failed to fetch dynamically imported module` errors.

### SSR Rendering
- **Status:** FAIL
- **Notes:** SSR module loads but rendering fails for ALL routes with `TypeError: Cannot read properties of undefined (reading 'signIn')` at AuthProvider construction. Root cause: (1) codegen doesn't generate auth SDK (#2303), so `api.auth` is undefined, and (2) AuthProvider accesses SDK methods at construction time before the SSR branch (#2302). Server gracefully falls back to client-only rendering (200, empty `#app` div). No 500 errors, no crashes.

### Client-Side Hydration
- **Status:** PARTIAL
- **Notes:** App mounts and begins rendering. All modules load. Crash at AuthProvider prevents full app rendering. Error overlay renders correctly showing the runtime error with source-mapped code context.

### Routing (Nested Layouts)
- **Status:** BLOCKED
- **Notes:** Cannot test routing because AuthProvider wraps all routes and crashes. Will be unblocked by #2302.

### HMR
- **Status:** PASS
- **Notes:** WebSocket connection established via `ws://localhost:3099/__vertz_hmr`. File changes detected and hot-updated in 4ms. Module-level updates without full page reload. Reconnection with exponential backoff (100ms → 5000ms cap). Fast Refresh runtime properly integrated.

### Error Overlay
- **Status:** PASS
- **Notes:** Syntax errors show overlay with file path, error message, and VS Code link. Auto-dismisses on fix. Also shows runtime errors with full stack trace and source-mapped locations. Connected via `ws://localhost:3099/__vertz_errors`.

### Auth Flows
- **Status:** FAIL
- **Notes:** Auth infrastructure not available in V8 isolate. AuthProvider crashes during construction. Codegen doesn't produce auth SDK (#2303). AuthProvider design accesses SDK methods eagerly (#2302).

### Entity CRUD (API Delegation)
- **Status:** FAIL
- **Notes:** All `/api/*` requests return 500 `{"error":"Handler error: No handler"}`. The Rust dev server does not delegate API routes to a Bun framework server. Filed as #2304.

### CSS/Styling
- **Status:** PASS
- **Notes:** CSS extracted from `.tsx` files with scoped class names (hash-based). `injectCSS()` calls in compiled output. Theme tokens resolve correctly (dark theme variables). No CSS-related errors in console.

## Issues Created

| # | Title | Priority | Area |
|---|-------|----------|------|
| #2302 | AuthProvider crashes during SSR — auth SDK not available in V8 isolate | P1 | auth, runtime |
| #2303 | Codegen doesn't generate auth SDK for linear-clone example | P2 | codegen, auth |
| #2304 | API route delegation missing in Rust dev server | P2 | runtime |

## Bugs Fixed

| Commit | Description | Priority |
|--------|-------------|----------|
| c1f1a98db | Strip TS type annotations from props transform output | P0 |
| 6322840cf | Address review findings (stale test name, debug print) | - |
| fde765ac2 | Always provide ssrAuth in framework SSR render | P1 (partial) |

## Known Limitations

- **AsyncLocalStorage:** Not available in V8 isolate. Server-side request context (cookies, session) is injected via globals instead of ALS. This is by design for the Rust runtime.
- **Codegen:** Must be run via Bun CLI (`bun packages/cli/dist/vertz.js codegen`). Rust CLI doesn't have a codegen command yet.
- **Auth SDK:** Codegen IR doesn't populate auth operations, so auth SDK is not generated. Pre-existing issue.
- **API delegation:** Rust dev server doesn't proxy `/api/*` to a framework server. Apps that need server-side API handlers must run a separate Bun process.

## Conclusion

The Rust dev server is **viable for frontend development** of Vertz apps. Compilation, module resolution, HMR, error overlay, and CSS extraction all work correctly. The primary blockers are auth-related (#2302, #2303) and API delegation (#2304), which are pre-existing gaps in the runtime, not regressions.

**Readiness for `--experimental-runtime` flag:** The compiler and dev tooling (HMR, error overlay, module serving) are production-quality. The gaps are in server-side infrastructure (auth, API delegation, SSR for authenticated apps). For apps without auth or with auth handled externally, the Rust dev server could be used today with the `--experimental-runtime` flag.

**Recommended next steps:**
1. Fix AuthProvider to defer SDK access during SSR (#2302) — unblocks SSR for all authenticated apps
2. Fix codegen auth IR population (#2303) — unblocks client-side auth flows
3. Implement API route delegation (#2304) — unblocks entity CRUD and auth endpoints
