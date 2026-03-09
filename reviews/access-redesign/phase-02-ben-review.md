# Phase 2: Plans + Limits + Billing Foundations — Ben Review

- **Author:** claude-agent
- **Reviewer:** ben (core/types)
- **Date:** 2026-03-09

## Changes

- packages/server/src/auth/define-access.ts (modified — new plan shape, validation rules, computed fields)
- packages/server/src/auth/access-context.ts (modified — multi-limit, canBatch, add-on resolution)
- packages/server/src/auth/access-set.ts (modified — new plan format for computeAccessSet)
- packages/server/src/auth/billing-period.ts (modified — quarter/year support)
- packages/server/src/auth/plan-store.ts (modified — add-on tracking)
- packages/server/src/auth/index.ts (modified — new exports)
- packages/server/src/auth/__tests__/define-access.test.ts (modified)
- packages/server/src/auth/__tests__/access-context.test.ts (modified)
- packages/server/src/auth/__tests__/access-set.test.ts (modified)
- packages/server/src/auth/__tests__/billing-period.test.ts (modified)
- packages/server/src/auth/__tests__/define-access.test-d.ts (modified)
- packages/integration-tests/src/__tests__/auth-plans-wallet.test.ts (modified)

## CI Status

- [x] `bun test` (150 unit + 15 integration) passed
- [x] `tsc --noEmit` passed
- [x] `biome check` passed (warnings only, no errors)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved with minor observations

**Type safety:**
- The `_planGatedEntitlements` and `_entitlementToLimitKeys` are non-generic (string-based). This is consistent with Phase 1's entity-centric approach. Type narrowing for specific entitlement names is deferred (correctly, per design doc).
- `DenialMeta.limit.key` is `string | undefined` (optional). Good — backward compat with Phase 1 code that doesn't set it.

**Computed fields at definition time:**
- `_planGatedEntitlements` is a `Set<string>` computed once during `defineAccess()`. This avoids per-check iteration over plans.
- `_entitlementToLimitKeys` maps `entitlement -> limitKey[]`. Correct for multi-limit resolution.

**Observation (non-blocking):**
- The `_` prefix convention for internal computed fields (`_planGatedEntitlements`, `_entitlementToLimitKeys`) is a reasonable signal that these are not part of the public API contract. TypeScript doesn't enforce this, but it's consistent with the codebase pattern.

**Multi-limit atomic consumption:**
- The rollback pattern in `canAndConsume()` is sound: consume sequentially, rollback all on any failure. For InMemoryWalletStore this is synchronous and safe. For database-backed stores, the atomicity guarantee depends on the store implementation (transactions). This is acknowledged as a Phase 2 scope constraint — real CAS will be needed for production stores.

## Resolution

No changes needed. Approved.
