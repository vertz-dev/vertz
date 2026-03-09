# Phase 2: Plans + Limits + Billing Foundations — Nora Review

- **Author:** claude-agent
- **Reviewer:** nora (frontend/DX)
- **Date:** 2026-03-09

## Changes

Same as ben review — all Phase 2 files.

## CI Status

- [x] All quality gates passed

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved

**DX wins in Phase 2:**

1. **Plan shape is intuitive.** `features` is a much better name than `entitlements` for what a plan unlocks. Developers will naturally read `features: ['workspace:create']` and understand it.

2. **Limits with `gates` is declarative.** The `{ max: 10, gates: 'workspace:create', per: 'month' }` shape makes it clear what the limit protects. Compare to the old format where limits were keyed by entitlement name — that was ambiguous (was the key a limit name or an entitlement name?).

3. **`canBatch()` API is clean.** Single entitlement across multiple entities returning `Map<entityId, boolean>` is exactly what a permissions check on a list page needs. Much better than calling `can()` N times.

4. **Error messages in validation are specific.** "Feature 'workspace:export' in plan 'pro' is not a defined entitlement" tells the developer exactly what to fix. Good DX for configuration errors.

**Minor observation (non-blocking):**
- The `_planGatedEntitlements` and `_entitlementToLimitKeys` being on the `AccessDefinition` interface (visible in autocomplete) may confuse users. The `_` prefix helps, but adding a JSDoc comment like `@internal` would be even better. Not a blocker.

## Resolution

No changes needed. Approved.
