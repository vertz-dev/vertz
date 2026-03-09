# Phase 2: Plans + Limits + Billing Foundations — Ava Review

- **Author:** claude-agent
- **Reviewer:** ava (quality/tests)
- **Date:** 2026-03-09

## Changes

Same as other reviews — all Phase 2 files.

## CI Status

- [x] 150 unit tests pass
- [x] 15 integration tests pass
- [x] Typecheck clean
- [x] Lint clean (warnings only)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps
- [x] No security issues
- [x] API matches design doc

## Findings

### Approved with observations

**Test coverage analysis:**

1. **Plan validation rules:** 10 tests covering all validation rules (features reference entitlements, limit gates reference entitlements, limit scope references entities, defaultPlan not add-on, base plan group requirement, add-on group prohibition, add-on limit key matching, limit max validation). Good.

2. **Access context layers:** Tests for plan layer (Layer 3), limit layer (Layer 4), multi-limit resolution, canAndConsume atomic consumption, canAndConsume rollback, unconsume, add-on features, add-on limits, canBatch. Total: 32 tests. Good.

3. **Access set:** 19 tests covering computeAccessSet with plan features, limits, denial reasons, encode/decode round-trip, flag integration. Updated for new plan format. Good.

4. **Billing period:** 13 tests covering month, day, hour, quarter, year. Good.

5. **Type-level tests:** Cover canBatch, PlanDef, LimitDef, BillingPeriod (quarter/year), PriceInterval, PlanPrice, DenialMeta.limit.key, computed fields. Good.

6. **Integration tests:** 15 tests covering plan layer can/check, wallet layer, canAndConsume/unconsume, per-customer overrides, accessSet with limits, encode/decode round-trip, E2E acceptance test (free -> exhaust -> upgrade -> succeed), billing period. Good.

**Timing issue fix (should-fix, already fixed):**
- The canAndConsume tests had a timing bug where `calculateBillingPeriod(new Date(), 'month')` was called with different timestamps for plan assignment vs wallet verification. Fixed by using a shared `startedAt` date. This was a real race condition that would intermittently fail in CI. Good catch.

**Observation (non-blocking):**
- No test for `max: -1` (unlimited) in `canAndConsume` — the limit layer test checks unlimited in `can()`, but `canAndConsume` with unlimited should also verify no wallet entry is created. The implementation does `continue` on `effectiveMax === -1`, which is correct — but untested in the atomic path.
- No test for `max: 0` (disabled) in `canAndConsume` — the `resolveAllLimitConsumptions` will return a consumption with `effectiveMax: 0`, and `canAndConsume` should deny and rollback. This path IS tested implicitly because `can()` would deny first via Layer 4, but the code path in `canAndConsume` that handles `effectiveMax === 0` is not directly tested.

These are minor coverage gaps, not blockers.

## Resolution

No changes needed. Approved.
