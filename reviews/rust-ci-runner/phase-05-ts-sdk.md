# Phase 5: TypeScript SDK — Adversarial Review

- **Reviewer:** review-agent
- **Date:** 2026-04-04

## Findings

### [BLOCKER-1] Loader callback registry disconnected from builders callback registry
**File:** `packages/ci/src/loader.ts:15-23` vs `packages/ci/src/builders.ts:26`
**Status:** FIXED — loader now imports `getCallbacks()` from builders, removed duplicate registry

### [BLOCKER-2] `Dep` type not re-exported from index.ts
**File:** `packages/ci/src/index.ts`
**Status:** FIXED — added `Dep` to type re-exports

### [SHOULD-FIX-1] RootDep brand type provides no enforcement
**Status:** DEFERRED — runtime validation in pipe() is more practical than structural typing for string patterns

### [SHOULD-FIX-2] Duplicate loader scripts (Rust-embedded vs package)
**Status:** ACKNOWLEDGED — Rust-embedded loader is the primary path; package loader.ts is now properly bridged via getCallbacks(). Will consolidate in follow-up.

### [SHOULD-FIX-3] getCallbacks() exported as public API
**Status:** DEFERRED — moving to separate entrypoint deferred to post-MVP

### [SHOULD-FIX-4] Module-level mutable state for callbacks
**Status:** ACKNOWLEDGED — acceptable for single-config-load use case

### [SHOULD-FIX-5] Missing test coverage for loader.ts
**Status:** DEFERRED — loader requires subprocess mocking; will add in integration test phase

### [SHOULD-FIX-6] `as never` cast hides type unsafety
**Status:** ACKNOWLEDGED — alternatives (`as unknown as Dep`) violate no-double-cast lint rule

## Summary
- 2 blocker(s) — all fixed
- 6 should-fix — 0 fixed, 6 deferred/acknowledged
- 4 nit(s) — noted
