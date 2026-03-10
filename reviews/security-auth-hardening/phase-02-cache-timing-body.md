# Phase 2: Cache Timing And Body Limits

- **Author:** Codex
- **Reviewer:** Codex-Adversarial
- **Commits:** working tree (uncommitted)
- **Date:** 2026-03-10

## Changes

- `packages/core/src/server/request-utils.ts` (modified)
- `packages/core/src/server/__tests__/request-utils.test.ts` (modified)
- `packages/server/src/auth/index.ts` (modified)
- `packages/server/src/auth/__tests__/access-set-jwt.test.ts` (modified)
- `packages/server/src/auth/__tests__/handler-edge-cases.test.ts` (modified)

## CI Status

- [ ] `dagger call ci` passed
- Attempted locally, but Dagger could not start because Docker was unavailable at `/Users/viniciusdacal/.docker/run/docker.sock`.
- Targeted verification passed:
  - [x] `bun test packages/server/src/auth/__tests__/access-set-jwt.test.ts`
  - [x] `bun test packages/core/src/server/__tests__/request-utils.test.ts`
  - [x] `bun test packages/server/src/auth/__tests__/handler-edge-cases.test.ts`
  - [x] `bun run --filter @vertz/core typecheck`
  - [x] `bun run --filter @vertz/server typecheck`

## Review Checklist

- [x] Delivers the intended cache, timing, and body-size hardening
- [x] TDD compliance for new cache and oversized-body regressions
- [x] No type gaps in touched framework/auth code
- [x] No new security issues found in this phase
- [x] Public API behavior matches the design plan

## Findings

### Approved

- `/api/auth/access-set` now marks responses `private` and varies on cookies while preserving the ETag flow.
- Forgot-password no longer waits on delivery callbacks and applies a minimum response floor to reduce enumeration timing differences.
- Framework request parsing now enforces the body limit while streaming, not only from `Content-Length`.
- Auth JSON endpoints now parse via the bounded parser instead of calling `request.json()` directly.

### Residual risk

- Repo-wide lint still fails on unrelated pre-existing diagnostics in `packages/cli`, so the global lint gate remains blocked outside this phase’s touched files.

## Resolution

No phase-specific issues remained after the new regressions passed.
