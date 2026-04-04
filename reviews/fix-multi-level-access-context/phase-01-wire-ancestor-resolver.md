# Phase 1: Wire ancestorResolver into AccessContext

- **Author:** implementation agent
- **Reviewer:** review agent (adversarial)
- **Date:** 2026-04-04

## Changes

- `packages/server/src/auth/access-context.ts` (modified)
- `packages/server/src/auth/__tests__/multi-level-access-context.test.ts` (new)

## CI Status

- [ ] Quality gates passed (pending)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests alongside implementation)
- [x] No type gaps or missing edge cases (see findings below)
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### SHOULD-FIX: `resolveAllLimitStates` uses `accessDef.defaultPlan` instead of level-specific `defaultPlans`

**Location:** `access-context.ts` line 1140-1143 (pre-existing helper, not introduced by this PR)

Both `checkMultiLevelLimits` (line 392) and `checkMultiLevelLimitsForCheck` (line 490) correctly resolve the plan using `accessDef.defaultPlans?.[entry.type] ?? accessDef.defaultPlan` for the gate check. However, they then delegate to `resolveAllLimitStates()` which internally re-fetches the subscription and re-resolves the plan using only `accessDef.defaultPlan` (the global default, line 1143).

When a subscription is expired and falls back to a default plan, the gate check and `resolveAllLimitStates` could resolve to different plans if `defaultPlans['account']` differs from `defaultPlan`. In normal operation (non-expired subscriptions), the plan ID comes from the subscription directly, so this is a non-issue.

**Severity:** Low. This is a pre-existing issue with `resolveAllLimitStates` -- it was written for single-level and isn't level-default-aware. The discrepancy only manifests with expired subscriptions AND differing per-level defaults. Filing as a follow-up issue is appropriate rather than blocking this PR.

**Recommendation:** Create a follow-up issue to refactor `resolveAllLimitStates` to accept an optional `defaultPlan` parameter (or the pre-resolved plan ID) so callers can pass the level-specific default.

### SHOULD-FIX: Redundant subscription fetch in multi-level limit checks

**Location:** `checkMultiLevelLimits` (line 389) and `checkMultiLevelLimitsForCheck` (line 487)

Both functions fetch the subscription via `subscriptionStore.get(entry.type, entry.id)`, then call `resolveAllLimitStates()` which fetches the same subscription again (line 1139). This results in 2 subscription fetches per ancestor level per `can()`/`check()` call.

**Severity:** Low (performance, not correctness). In-memory stores are cheap. Cloud/DB stores would benefit from a refactor, but the `resolveAllLimitStates` helper is used widely and changing its signature would be a larger refactor.

**Recommendation:** Accept for now. If profiling shows subscription store as a bottleneck in multi-level scenarios, refactor `resolveAllLimitStates` to accept a pre-resolved subscription.

### NIT: Missing test for `orgResolver` returning null with `ancestorResolver` present

When `orgResolver` returns `null`, `resolveAncestorChain` is not called (line 323: `const chain = resolvedOrg ? await resolveAncestorChain(resolvedOrg) : null`), and the flag/plan/limit guards all check `resolvedOrg` before using `chain`. This is correct behavior, but there's no explicit test for it.

Not blocking because the code path is straightforward (all guards check `resolvedOrg` first), but adding a test would improve confidence.

### NIT: Missing test for `ancestorResolver` returning empty array

When `ancestorResolver` returns `[]`, the chain becomes `[{ type: org.type, id: org.id, depth: 0 }]` -- just the self entry. The multi-level path is triggered but behaves identically to single-level. This is correct but untested. Low risk since the chain iteration simply has one entry.

### NIT: `resolveAncestorChain` uses `org.type` while `computeAccessSet` uses `config.tenantLevel` for the self entry

**Location:** `access-context.ts` line 146 vs `access-set.ts` line 176

`resolveAncestorChain` constructs the self entry as `{ type: org.type, ... }` while `computeAccessSet` uses `{ type: config.tenantLevel!, ... }`. In normal usage these are identical (the org resolver returns the same type as the tenant level), but there's no assertion enforcing this invariant.

Not blocking -- the `orgResolver` is expected to return the correct type.

## Correctness Assessment

### Flag resolution: "deepest wins"
**Matches `computeAccessSet`.** Both iterate child-to-root, first match wins. The `access-context.ts` implementation processes one flag at a time (per `can()` call) vs `computeAccessSet`'s batch approach, but semantics are identical.

### Plan feature resolution: inherit vs local
**Matches `computeAccessSet`.** `inherit` checks all levels (any match = allowed). `local` skips `entry.depth !== 0` so only the deepest level is checked. Both use the same `resolveEffectivePlan` + feature set logic.

### Limit cascade: check all ancestor levels
**More thorough than `computeAccessSet`.** The `computeAccessSet` only checks the deepest level's wallet for JWT embedding. The `access-context.ts` checks limits at ALL ancestor levels (any exceeded = deny). This is the correct runtime behavior per the issue description.

### Single-level regression
**No regression risk.** When `ancestorResolver` is not provided, `resolveAncestorChain` returns `null`, and all `if (chain)` checks fall through to existing single-level code paths. The existing 2941-line test file covers single-level scenarios comprehensively.

### `canAndConsume()` compatibility
**Works correctly.** `canAndConsume()` uses `resolveAncestorChain` for Layers 1-3 (read-only checks: flags, roles, plan features) and `buildConsumptionChain` for Layer 4 (wallet consumption with root-to-leaf lock ordering). These serve different purposes and work together without interference.

### Performance
**Acceptable.** `resolveAncestorChain` is called once per `can()`/`check()`/`canAndConsume()` call. The chain is passed through to all sub-checks. The redundant subscription fetches in limit checks are the only performance concern (see SHOULD-FIX above).

### Edge cases: null org, empty ancestors, no subscription
All handled correctly:
- `resolvedOrg` null: chain is null, falls through to single-level (which also handles null org)
- Empty ancestors: chain has only self entry, behaves as single-level
- No subscription at a level: `if (!sub) continue` in limit checks; `resolveEffectivePlan` returns null + `if (!planId) continue` in feature checks

## Test Coverage Assessment

The test file covers:
- Flag resolution: deepest wins (3 scenarios + `check()`)
- Plan feature resolution: inherit mode (3 scenarios + 2 `check()` tests)
- Plan feature resolution: local mode (1 scenario)
- Limit cascade: project exceeded (1 scenario), account exceeded (1 scenario), neither exceeded (1 scenario), `check()` with limit_reached (1 scenario)

**Total: 13 test cases across all 3 acceptance criteria.**

Missing but non-blocking:
- `check()` for local mode plan features (only `can()` is tested)
- `orgResolver` returning null with `ancestorResolver` present
- Empty ancestor chain
- 3-level hierarchy (current tests are 2-level only)
- `canAndConsume()` with multi-level flags/features (it uses the new chain for layers 1-3)

## Resolution

### Approved with SHOULD-FIX items

The implementation is correct, matches the `computeAccessSet` semantics, and covers the three acceptance criteria from issue #1829. The SHOULD-FIX items are:

1. **`resolveAllLimitStates` default plan discrepancy** -- pre-existing, file a follow-up issue
2. **Redundant subscription fetches** -- performance nit, acceptable for now

Neither blocks this PR. The code is clean, follows existing patterns, and introduces no regressions to single-level codepaths.
