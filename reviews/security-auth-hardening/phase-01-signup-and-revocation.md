# Phase 1: Signup And Session Revocation

- **Author:** Codex
- **Reviewer:** Codex-Adversarial
- **Commits:** working tree (uncommitted)
- **Date:** 2026-03-10

## Changes

- `packages/server/src/auth/types.ts` (modified)
- `packages/server/src/auth/session-store.ts` (modified)
- `packages/server/src/auth/db-session-store.ts` (modified)
- `packages/server/src/auth/index.ts` (modified)
- `packages/server/src/auth/__tests__/handler-edge-cases.test.ts` (modified)
- `packages/server/src/auth/__tests__/types.test-d.ts` (modified)

## CI Status

- [ ] `dagger call ci` passed
- Attempted locally, but Dagger could not start because Docker was unavailable at `/Users/viniciusdacal/.docker/run/docker.sock`.
- Targeted verification passed:
  - [x] `bun test packages/server/src/auth/__tests__/handler-edge-cases.test.ts`
  - [x] `bun run --filter @vertz/server typecheck`

## Review Checklist

- [x] Delivers the intended security hardening for public signup and revoked sessions
- [x] TDD compliance for the new regressions
- [x] No new type gaps in touched auth code
- [x] No new security regressions found in this phase
- [x] Public API behavior matches the design plan

## Findings

### Approved

- Public signup now strips reserved privilege-bearing fields before persistence or session issuance.
- `GET /session` now requires an active backing session record, so revoked JWT-backed sessions stop authenticating immediately.
- Type coverage was added so reserved signup fields are rejected at compile time for the public `SignUpInput` surface.

### Residual risk

- Full repo lint and full Dagger CI were not cleanly available for this phase because of unrelated repository lint failures in `packages/cli` and a missing Docker daemon for Dagger.

## Resolution

No phase-specific issues remained after the regression tests and typecheck passed.
