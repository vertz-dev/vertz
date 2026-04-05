# Phase 2: Validate SSR

- **Author:** belo-horizonte
- **Reviewer:** adversarial-reviewer
- **Commits:** fde765ac2
- **Date:** 2026-04-04

## Changes

- `native/vtz/src/runtime/persistent_isolate.rs` (modified — ssrAuth format fix)

## CI Status

- [x] Quality gates passed at fde765ac2 (clippy + fmt for vtz crate)

## Validation Findings

### SSR Module Loading: PASS

Server log confirms:
```
[Server] Persistent V8 isolate created (mode: SSR only)
[Server] SSR entry loaded: examples/linear/src/app.tsx
[Server] ssrRenderSinglePass loaded from @vertz/ui-server/ssr
```

The Phase 1 compiler fix (TS stripping) resolved the module loading issue.

### SSR Rendering: FAIL (all routes)

**Error:** `TypeError: Cannot read properties of undefined (reading 'signIn')` at AuthProvider construction.

**Root cause:** Two compounding issues:

1. **Codegen doesn't generate auth SDK** — `.vertz/generated/auth.ts` is not produced, so `api.auth` is `undefined`. Filed as #2303.

2. **AuthProvider accesses SDK methods at construction time** — Even if the auth SDK existed, AuthProvider accesses `auth.signIn.url` and `auth.signIn.method` during construction, before the `isBrowser()` / SSR branch. In the V8 isolate, these methods don't exist. Filed as #2302.

### Route-by-Route Results

| Route | Expected | Actual | Notes |
|-------|----------|--------|-------|
| `/` | SSR or redirect to `/login` | 200, client-only fallback | AuthProvider crash blocks SSR |
| `/login` | SSR with OAuth button markup | 200, client-only fallback | AuthProvider crash blocks SSR |
| `/projects` | Client-only fallback (auth-protected) | 200, client-only fallback | Same root cause |
| `/projects/:id` | Client-only fallback | 200, client-only fallback | Same root cause |

### Graceful Fallback: PASS

All routes return HTTP 200 with the full HTML shell and an empty `<div id="app">`. No 500 errors. No server crashes. No `X-Vertz-SSR-Error` response header. The client bundle loads and renders the app entirely client-side.

### ssrAuth Format Fix

The `persistent_isolate.rs` change correctly matches the Bun dev server pattern:
- Always provides `ssrAuth` to `ssrRenderSinglePass`
- Authenticated: `{ status: 'authenticated', user, expiresAt }`
- Unauthenticated: `{ status: 'unauthenticated' }`

This is necessary but not sufficient — the AuthProvider crash is upstream of ssrAuth consumption.

## Acceptance Criteria Status

- [x] Server log shows `SSR module loaded`
- [ ] `curl /login` returns HTML with OAuth button inside `<div id="app">` — **BLOCKED by #2302**
- [x] No `X-Vertz-SSR-Error` response header
- [x] All blocking issues filed as GitHub issues (#2302, #2303)

## Issues Filed

| # | Title | Priority | Area |
|---|-------|----------|------|
| #2302 | AuthProvider crashes during SSR — auth SDK not available in V8 isolate | P1 | auth, runtime |
| #2303 | Codegen doesn't generate auth SDK for linear-clone example | P2 | codegen, auth |

## Resolution

SSR rendering is blocked by the AuthProvider SDK access pattern (#2302) and missing codegen (#2303). Both are pre-existing issues not introduced by this validation. The partial ssrAuth format fix (fde765ac2) is correct and will be needed once #2302 is resolved.

Client-only fallback works correctly for all routes. Phase 3 (client-side validation) can proceed since the app renders fully on the client.

## Adversarial Review

**Reviewer:** adversarial-reviewer
**Verdict:** APPROVED with one informational finding

### Review Checklist
- [x] ssrAuth format fix correct (matches Bun dev server pattern)
- [x] No regressions introduced
- [x] Issues #2302, #2303 accurately describe root causes
- [x] Triage decisions sound (> 2h → file issue)
- [x] No findings silently skipped
- [x] Validation methodology sound

### Informational Finding: Session Leakage in Persistent Isolate
`SSR_RESET_JS` doesn't clear `globalThis.__vertz_session` between requests. Currently not triggered (session_json always None), but would cause session leakage once cookie-based session resolution is implemented. Filed as #2306.
