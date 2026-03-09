# Phase 3: Overrides + Advanced Limits — Ava (Quality/Tests) Review

- **Reviewer:** ava
- **Commit:** e8ffe848
- **Date:** 2026-03-09

## Scope

Reviewed test coverage and quality for Phase 3:

- `packages/server/src/auth/__tests__/override-store.test.ts` (new — 14 tests)
- `packages/server/src/auth/__tests__/access-context.test.ts` (added — override + overage tests)
- `packages/server/src/auth/__tests__/define-access.test.ts` (added — requires validation)
- `packages/server/src/auth/__tests__/plan-store.test.ts` (added — compatibility checks)
- `packages/integration-tests/src/__tests__/auth-plans-wallet.test.ts` (added — integration tests)
- Cross-referenced against Phase 3 plan's "Expected Behaviors to Test" checklist

## Findings

### Blockers

**B1. One-off add-on semantics — ZERO tests, ZERO implementation.**

The Phase 3 plan lists four specific one-off behaviors to implement and test:

- [ ] One-off +50 persists across billing period resets
- [ ] Multiple one-off purchases stack (+50 x 2 = +100)
- [ ] One-off allocation persists when base plan changes
- [ ] Consumption uses base plan periodic allocation before one-off (FIFO)

None of these have tests. None of these have implementation. The wallet store has no concept of "lifetime" vs "periodic" allocation. The `computeEffectiveLimit()` function treats all add-on limits identically — there is no check for `price.interval === 'one_off'` anywhere in the resolution logic.

This is 25% of the Phase 3 scope entirely missing.

**B2. `canAndConsume()` with overage — no tests.**

The `canAndConsume()` function was modified to support overage (lines 521-543 of `access-context.ts`), including overage cap checking and raising `consumeMax` to `Number.MAX_SAFE_INTEGER`. But there are zero tests for:

- `canAndConsume()` succeeding when in overage
- `canAndConsume()` failing when overage cap is hit
- `canAndConsume()` rollback when overage cap is exceeded mid-batch

This is significant new logic with no test coverage.

### Should-Fix

**S1. Override validation edge case `max: -2` is tested, but `max: -100`, `max: -0.5` (non-integer negative) are not.**

The `validateOverrides()` function checks `max < -1`, but there's no test for non-integer `max` values. Since `LimitDef.max` validation requires integers but `LimitOverrideDef` validation doesn't, this is an untested gap (also flagged by ben as S1).

**S2. `check()` overage behavior — only one scenario tested.**

The `check()` function has complex overage logic with three distinct paths:
1. Overage allowed, no cap hit -> `allowed: true, meta.limit.overage: true`
2. Overage allowed, cap hit -> `allowed: false, reason: 'limit_reached', meta.limit.overage: true`
3. Overage configured but `max: 0` (disabled) -> cap doesn't apply

Only path 1 is tested. Path 2 is tested via `can()` but NOT via `check()` (the test only calls `can()`, not `check()` for the cap-hit scenario). Path 3 is untested.

**S3. Missing test: `can()` with overrides but NO override store configured.**

When `overrideStore` is `undefined` in `AccessContextConfig`, the code sets `overrides = null` and passes it through. This path should be tested to ensure no regression — that override-unaware code still works correctly.

**S4. Missing test: override `add` to negative that would make effective limit negative.**

`computeEffectiveLimit()` line 866 does `Math.max(0, effectiveMax + limitOverride.add)`. This clamps to zero, which is correct. But there's no test verifying that `add: -200` on a base of `100` results in `max: 0` (not `-100`). The implementation is correct, but the clamping behavior needs a test to protect against regression.

**S5. Phase 3 plan checklist items missing from tests:**

| Plan Checklist Item | Tested? |
|---|---|
| Override limit key not in any plan -> validation error | Yes |
| Override feature referencing undefined entitlement -> validation error | Yes |
| Override `max: -2` -> validation error | Yes |
| Override `add: -50` -> valid | Yes |
| Override `max: 0` -> valid | Yes |
| One-off +50 persists across billing period resets | **NO** |
| Multiple one-off purchases stack | **NO** |
| One-off allocation persists when base plan changes | **NO** |
| Consumption uses base plan periodic allocation before one-off | **NO** |
| Add-on with `requires` - attaches to compatible plan | Yes |
| Add-on with `requires` - rejects incompatible plan | Yes |
| Tenant downgrades -> incompatible add-ons flagged | Yes |
| Overage -> `can()` returns true beyond limit | Yes |
| `check()` includes `meta.limit.overage: true` | Yes |
| Overage cap hit -> hard block | Yes |
| Overage without payment processor -> validation error (production mode) | **NO** |
| Overage with InMemory store -> tracked but not billed | **NO** |

6 of 17 checklist items are untested/unimplemented.

### Observations

**O1.** The override store tests are well-structured with good boundary cases (empty tenant, dispose, duplicate features). Good TDD discipline for the parts that were implemented.

**O2.** Integration tests correctly use `@vertz/server` public imports. Good.

**O3.** The overage cap test uses a precise calculation: `100 base + 500 overage units * $0.01 = $5.00 = cap`. This is the right kind of concrete, reproducible test. More of these are needed.

**O4.** No `.test-d.ts` tests were added for the new types (`OverageConfig`, `AddOnRequires`, `LimitOverrideDef`, `TenantOverrides`). Phase 2 had type-level tests; Phase 3 should too.

## Verdict

**Changes Requested** — B1 (one-off add-on semantics entirely missing) is a blocker. This is 25% of the Phase 3 scope with zero implementation and zero tests. B2 (untested `canAndConsume()` overage logic) leaves significant new code untested.
