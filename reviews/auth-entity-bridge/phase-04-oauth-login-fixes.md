# Phase 4: OAuth Login Flow Fixes

- **Author:** claude
- **Reviewer:** adversarial-review-agent
- **Commits:** 0b9d26cf..786d5989
- **Date:** 2026-03-12

## Changes

- packages/ui/src/auth/auth-context.ts (modified) — deferred refresh via setTimeout(0), cancelable timer
- packages/ui-compiler/src/signal-api-registry.ts (modified) — useAuth moved to reactive-source
- packages/ui/reactivity.json (modified) — useAuth type changed to reactive-source
- packages/ui/src/auth/__tests__/auth-context.test.ts (modified) — tests updated for deferred refresh
- packages/server/src/auth/db-session-store.ts (modified) — raw SQL for findActiveSessionById, removed dead code
- packages/server/src/auth/index.ts (modified) — cookie maxAge matches JWT TTL
- packages/server/src/create-server.ts (modified) — conditional auto-wiring of OAuth store and entity proxy
- packages/server/src/auth/__tests__/db-session-store.test.ts (modified) — tests updated for raw SQL

## CI Status

- [x] All 79 turbo tasks pass (lint, typecheck, test, build)
- [x] Pre-push hook passes

## Review Checklist

- [x] Delivers what the ticket asks for (OAuth login works end-to-end)
- [x] TDD compliance (tests updated alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### SHOULD-FIX (addressed)

1. **Race condition: deferred refresh vs signIn** — `setTimeout(() => void refresh(), 0)` could
   race with `signIn()` if user acts quickly. Fixed by storing timer ID and canceling in
   signIn/signUp.

2. **DbOAuthAccountStore unconditionally auto-wired** — Created even when no OAuth providers
   configured. Fixed: only created when `config.auth.providers` is non-empty.

3. **Entity proxy unconditionally created** — `registry.createProxy()` called even without
   `onUserCreated`. Fixed: only created when callback exists.

### SHOULD-FIX (not addressed — pre-existing)

4. **Non-atomic rollback** — If `onUserCreated` fails, cleanup of auth_users + oauth_accounts
   is sequential with individual try/catch. Non-transactional. Acceptable pre-v1.

5. **URL construction edge case** — `errorRedirect.includes('?')` doesn't handle fragments.
   Pre-existing from earlier commit.

### NITPICK (acknowledged, not blocking)

6. **Google base64url decoding** — `atob()` used instead of proper base64url. Pre-existing.
7. **Provider response types** — `Record<string, unknown>` casts lose type safety. Pre-existing.
8. **Cookie maxAge semantics** — JWT cookie expires with TTL, may surprise developers. Correct behavior.
9. **useAuth reactive-source** — all properties now reactive, compiler verified not to add `.value` to methods.
10. **_entityProxy visibility** — `@internal` field is documentation-only. Acceptable pre-v1.
11. **DOM shim additions** — `addEventListener`/`removeEventListener` stubs undocumented.

## Resolution

Findings 1-3 addressed in commit `786d5989`. Findings 4-11 are pre-existing or accepted trade-offs.

### Approved
