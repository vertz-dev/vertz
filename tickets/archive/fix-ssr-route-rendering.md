# fix-ssr-route-rendering

**Status:** in-progress
**Assignee:** ben
**Priority:** P1 (bug — broken SSR routing)
**PR:** #293

## Problem

SSR renders "Page not found" for ALL routes including `/` in dev mode.

### Root Cause

1. **Middleware order**: `configureServer` returns a post-hook (`return () => { ... }`), so SSR middleware runs AFTER Vite's SPA fallback which rewrites `/` → `/index.html` — matching no routes.
2. **URL normalization**: The SSR entry passes the raw URL (potentially `/index.html`) to the router without stripping the suffix.
3. **Module caching**: `router.ts` is cached after first SSR import; `createRouter()` only runs once with the first URL.

### Fix

1. Register SSR middleware BEFORE Vite internals (direct `server.middlewares.use()`, no post-hook)
2. Normalize URLs: strip `/index.html` suffix in SSR entry
3. Invalidate only the SSR entry virtual module per request (not ALL SSR modules)

## Acceptance Criteria

- [ ] `/` returns 200 with SSR-rendered HTML
- [ ] `/settings`, `/tasks/new`, `/tasks/:id` return correct SSR content
- [ ] Non-existent routes return appropriate response
- [ ] Integration test starts real Vite dev server and verifies HTTP responses
- [ ] Module invalidation is surgical (only SSR entry, not entire module graph)
- [ ] TDD process: Red → Green → Refactor with separate commits
