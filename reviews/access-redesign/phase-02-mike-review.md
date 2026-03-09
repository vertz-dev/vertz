# Phase 2: Plans + Limits + Billing Foundations — Mike Review

- **Author:** claude-agent
- **Reviewer:** mike (architecture)
- **Date:** 2026-03-09

## Changes

Same as other reviews — all Phase 2 files.

## CI Status

- [x] All quality gates passed

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps
- [x] No security issues
- [x] API matches design doc

## Findings

### Approved with architectural observations

**Architecture evaluation:**

1. **Plan-declares-features pattern:**
   The shift from "entitlements reference plans" to "plans declare features" is architecturally sound. It centralizes plan configuration in one place, making it easier to add/remove plans without touching entitlement definitions. The computed `_planGatedEntitlements` set is the right optimization — O(1) lookup during can() instead of iterating over all plans.

2. **Multi-limit resolution:**
   The `_entitlementToLimitKeys` mapping computed at definition time is correct. The all-or-nothing consumption pattern (consume sequentially, rollback on failure) is appropriate for InMemoryWalletStore. For production database stores, this should be implemented as a transaction. The current abstraction doesn't enforce this — the `WalletStore` interface has individual `consume()`/`unconsume()` methods, not a batch atomic operation. This is a known limitation.

3. **Add-on composition:**
   Features are additive (union), limits are additive (sum of max values). This is the simplest correct semantics. The add-on limit lookup iterates `getAddOns()` results for every limit check — fine for small add-on counts (typical: 0-3), but could be optimized if add-on counts grow. Not a concern for Phase 2.

4. **Billing period generalization:**
   Converting `calculateMonthlyPeriod` to `calculateMultiMonthPeriod(interval)` is clean. The quarter (3 months) and year (12 months) cases are correct. The edge case handling for month-end clamping (Jan 31 -> Feb 28) carries over correctly.

5. **Layer order:**
   The comment header says "5-layer resolution" but the implementation now has effectively 7 conceptual layers (auth -> flags -> plan features -> limits -> roles -> attr rules -> step-up). The comment at the top of access-context.ts should be updated to reflect the actual evaluation order. This is a **should-fix** documentation issue.

**Should-fix:**
- Update the comment at the top of `access-context.ts` to reflect the actual layer structure (currently says "5-layer resolution" but the design has 7 layers).

**Non-blocking observations:**
- `canAll()` is still present alongside `canBatch()`. The design doc says to remove it. Consider deprecating in a follow-up. Not a blocker since pre-v1 breaking changes are encouraged.
- The `resolveEffectiveFeatures` helper and `resolveAllLimitStates` helper are inline functions inside `createAccessContext`. If they grow more complex, extracting them to module-level functions would improve testability.

## Resolution

Should-fix the comment header in access-context.ts. Otherwise approved.
