# Phase 7: Client-Side + UI Components — Ava (Quality/Tests) Review

- **Author:** implementation agent
- **Reviewer:** ava
- **Commits:** d7df226e..4b768c4d
- **Date:** 2026-03-09

## Scope

Test coverage, TDD compliance, and quality gate adherence for Phase 7's plan event broadcasting, client-side event handling, JWT access set plan features, and reactive signal cascades.

## Changes

- `packages/server/src/auth/__tests__/access-event-broadcaster.test.ts` — 5 new tests
- `packages/server/src/auth/__tests__/access-set.test.ts` — 3 new tests
- `packages/ui/src/auth/__tests__/access-event-client.test.ts` — 4 new tests
- `packages/ui/src/auth/__tests__/reactive-cascade.test.ts` — 6 new tests

## Findings

### Blockers

**B1. Multiple phase plan acceptance criteria are not tested.**

The phase plan (`phase-07-client-side-and-ui.md`) lists these expected behaviors to test:

**Access set with plans (access-set.test.ts):**
- [x] `computeAccessSet()` includes plan features in the set
- [x] `computeAccessSet()` includes role assignments (covered by existing tests)
- [ ] `computeAccessSet()` includes feature flags -- **NOT TESTED in Phase 7 commits** (existing tests may cover this, but the phase doesn't add or verify it)
- [ ] Encoded access set fits within 2KB JWT budget -- **NOT TESTED**
- [ ] Overflow strategy still works when plan features push set over 2KB -- **NOT TESTED**

**Client-side can():**
The phase plan has a full BDD spec for client-side reactive `can()`:
- [ ] `can("project:edit").allowed is true` -- **NOT IMPLEMENTED OR TESTED**
- [ ] `can("project:export").reason is "plan_required"` -- **NOT IMPLEMENTED OR TESTED**
- [ ] `can("project:delete").allowed is true (role check)` -- **NOT IMPLEMENTED OR TESTED**
- [ ] Limit-gated entitlement returns advisory result -- **NOT IMPLEMENTED OR TESTED**
- [ ] WebSocket event for plan change re-evaluates reactive `can()` -- **NOT TESTED as integration**

The reactive `can()` signal API is the central deliverable of this phase per the plan. It is entirely absent.

**B2. No integration test in `packages/integration-tests/`.**

The phase plan requires:
```
packages/integration-tests/src/__tests__/
├── auth-client-side.test.ts     # NEW — client-side can() E2E
```

This file was not created. Integration tests using public package imports are a hard requirement per the design rules.

### Should-Fix

**S1. `handleLimitReset` missing edge case test: entitlement with no existing limit meta.**

What happens when `handleLimitReset` is called for an entitlement that exists but has no `meta.limit`? The handler checks `if (!existingEntry) return;` but does not check `if (!existingEntry.meta?.limit)`. The function will proceed to set `meta: { ...existingEntry.meta, limit: newLimit }`, which would create a limit where none existed before. This is arguably correct behavior (reset means "set to fresh"), but it should be tested.

**S2. `handleLimitReset` missing edge case test: entitlement with multiple denial reasons including `limit_reached`.**

Test with `reasons: ['plan_required', 'limit_reached']`. After reset, should become `reasons: ['plan_required']` and `allowed` should remain `false`. This important edge case is not tested.

**S3. `handlePlanAssigned` missing edge case test: plan assigned when current plan is `null`.**

The `AccessSet` type allows `plan: null`. What happens when `plan_assigned` fires on an access set where `plan` is `null`? The handler doesn't guard against this. Should be tested.

**S4. Access set JWT test does not verify `project:export` behavior.**

The `project:export` entitlement has `flags: ['export-v2']` in the test fixture. The test with the `pro` plan checks `project:view`, `project:edit`, `project:delete` but NOT `project:export`. Since no flag store is provided, `project:export` should still be allowed (flag checking is skipped when no flag store is given). This should be verified.

**S5. Broadcaster tests don't verify that `broadcastLimitConsumed` (from phase plan item #4) exists.**

The phase plan mentions `limit:consumed` as a plan event to broadcast. There is no `broadcastLimitConsumed` method. Only `broadcastLimitReset` and the existing `broadcastLimitUpdate` are implemented. If `limit:consumed` was intentionally mapped to `broadcastLimitUpdate`, this should be documented.

### Observations

**O1.** The test file `reactive-cascade.test.ts` removed unused imports (`afterEach`, `beforeEach`, `mock`, and `ClientAccessEvent` type). This is good cleanup.

**O2.** Test boilerplate in `access-event-client.test.ts` is high. Each test creates a new client, connects, opens, sends a message. A `beforeEach` or helper would reduce duplication.

**O3.** The quality gates listed in the phase plan (`bun test --filter @vertz/server`, `bun test --filter @vertz/ui`, etc.) were presumably run but there is no evidence in the commit messages.

## Verdict

**Changes Requested.**

B1 is critical. The phase plan's central deliverable -- the client-side reactive `can()` signal API -- is not implemented. The phase adds event infrastructure and tests for it, but the actual `can()` API that developers would use is absent. This means the phase is incomplete against its acceptance criteria.

B2 requires creating the integration test file. Even if the reactive `can()` is deferred, the JWT access set with plan features should have integration coverage using public imports.

S1 and S2 are important edge case coverage gaps in the handler logic.
