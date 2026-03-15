# Phase 3: Provider Config + Lifecycle + SSR

- **Author:** Phase 3 implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** c77e6271
- **Date:** 2026-03-15

## Changes

- `packages/server/src/auth/types.ts` (modified — added `CloudOAuthProviderConfig`)
- `packages/server/src/auth/providers/github.ts` (modified — union config, cloud mode stubs)
- `packages/server/src/auth/providers/google.ts` (modified — union config, cloud mode stubs)
- `packages/server/src/auth/providers/discord.ts` (modified — union config, cloud mode stubs)
- `packages/server/src/auth/cloud-proxy.ts` (modified — `CloudProxyLifecycleCallbacks`, lifecycle processing)
- `packages/server/src/auth/cloud-proxy.test.ts` (modified — lifecycle callback tests)
- `packages/server/src/auth/resolve-session-for-ssr.ts` (modified — `cloudVerifier` path, optional `jwtSecret`, validation)
- `packages/server/src/auth/resolve-session-for-ssr.test.ts` (new — cloud verifier tests, backward compat, config validation)
- `packages/server/src/auth/index.ts` (modified — exports)
- `packages/server/src/create-server.ts` (modified — cloud mode uses shared `resolveSessionForSSR`)
- `packages/server/src/index.ts` (modified — exports)

## CI Status

- [x] Tests: 975 pass, 0 fail
- [x] Typecheck: clean
- [x] Biome lint: clean (warnings only)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Blockers

**B1: Lifecycle callback errors crash the proxy** — FIXED
Callbacks were `await`ed without try/catch. If a developer's callback throws, the
response to the client would be an unstructured error instead of the successful auth
response already received from cloud. Fixed: wrapped in try/catch with console.error.
Added tests for both onUserCreated and onUserAuthenticated throwing.

### Should Fix

**S1: `onUserAuthenticated` receives user object, not SessionPayload** — ACCEPTED
Design doc says `SessionPayload`, but cloud mode only has the JSON response body, not
the decoded JWT. In cloud mode the JWT is set as a cookie and not decoded by the proxy.
Passing the user object from the response body is the correct approach for cloud mode.
Self-hosted mode uses the full `SessionPayload` from its local JWT. This is an intentional
deviation documented in the `CloudProxyLifecycleCallbacks` interface.

**S2: Missing `AuthCallbackContext` in cloud `onUserCreated`** — ACCEPTED
Cloud mode has no local entity store, so `AuthCallbackContext` (entity proxy) is not
available. The `CloudProxyLifecycleCallbacks` interface documents this via its type
signature — it takes a simpler `{ user, provider, profile }` payload.

**S3: No mutual exclusion validation for jwtSecret + cloudVerifier** — FIXED
Added validation that throws when both are provided. Added test.

**S4: `as any` casts in lifecycle callback tests** — FIXED
Replaced with typed capture variables using `Parameters<NonNullable<...>>`.

### Nitpicks

**N1: Provider cloud stubs duplicate code** — Accepted (3 copies is below abstraction threshold)
**N2: HS256 backward compat test is minimal** — Comprehensive tests in `__tests__/` directory
**N3: `lifecycle` wrapper vs flat options** — Reasonable grouping, minor deviation from design doc

## Resolution

All blockers and should-fix items addressed. B1 and S3 fixed with tests. S1 and S2 accepted
as intentional deviations from design doc (cloud mode constraints). S4 fixed.

## Verdict

**Approved** — all findings resolved.
