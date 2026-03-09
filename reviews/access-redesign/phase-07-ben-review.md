# Phase 7: Client-Side + UI Components — Ben (Core/Types) Review

- **Author:** implementation agent
- **Reviewer:** ben
- **Commits:** d7df226e..4b768c4d
- **Date:** 2026-03-09

## Scope

Phase 7 adds plan lifecycle event types to the access broadcaster, client-side event handling in the access event client and handler, JWT access set plan feature verification, and reactive signal updates for plan/addon/limit-reset events.

## Changes

- `packages/server/src/auth/access-event-broadcaster.ts` (modified — 4 new event types + 4 new broadcast methods)
- `packages/server/src/auth/__tests__/access-event-broadcaster.test.ts` (modified — 5 new tests)
- `packages/server/src/auth/__tests__/access-set.test.ts` (modified — 3 new tests for plan-aware JWT access set)
- `packages/ui/src/auth/access-event-client.ts` (modified — 4 new event types in `ClientAccessEvent`)
- `packages/ui/src/auth/access-event-handler.ts` (modified — `handlePlanAssigned`, `handleLimitReset` handlers)
- `packages/ui/src/auth/__tests__/access-event-client.test.ts` (modified — 4 new tests)
- `packages/ui/src/auth/__tests__/reactive-cascade.test.ts` (modified — 6 new tests)

## Findings

### Blockers

**B1. `handlePlanAssigned` only updates the `plan` field but does not re-evaluate entitlements.**

When `plan_assigned` fires, the handler calls `handlePlanAssigned()` which does `accessSet.value = { ...current, plan: planId }`. This updates the plan label but the `entitlements` map still reflects the OLD plan's feature set. A client displaying `can('project:export').allowed` will show stale results until a full refetch occurs. The `plan_assigned` event is specifically designed to carry the new `planId` so the client can update the plan label for display, but the design doc's client-side `can()` table says plan features are evaluated "from JWT access set." The handler needs to either:
- (a) Treat `plan_assigned` like `plan_changed` and defer to refetch (in which case why have a separate event?), or
- (b) Re-evaluate plan-gated entitlements using the new plan definition from the access config.

The current implementation does neither coherently. The `plan` field changes but entitlements are stale. This is a correctness issue.

**Recommendation:** Either (a) make `plan_assigned` trigger a refetch (same as `plan_changed`), or (b) accept that `plan_assigned` is a "metadata update" that the UI uses to show the new plan name, while a separate `plan_changed` event triggers the refetch that updates entitlements. If (b), document this clearly and add a test asserting that a `plan_changed` event follows `plan_assigned`.

### Should-Fix

**S1. `handleLimitReset` has a logic bug in `allowed` re-evaluation when multiple denial reasons exist.**

The code:
```ts
const wasOnlyLimitBlocked =
  existingEntry.reasons.length > 0 && existingEntry.reasons.every((r) => r === 'limit_reached');

newEntitlements[entitlement] = {
  ...existingEntry,
  allowed: wasOnlyLimitBlocked ? true : existingEntry.allowed || reasons.length === 0,
  ...
};
```

Consider an entitlement with `reasons: ['plan_required', 'limit_reached']`. After reset, `reasons` becomes `['plan_required']`. `wasOnlyLimitBlocked` is `false`. Then `existingEntry.allowed || reasons.length === 0` evaluates to `false || false` = `false`. This is correct for this case.

But consider `reasons: ['limit_reached', 'limit_reached']` (duplicate). After filtering, `reasons` is `[]`. `wasOnlyLimitBlocked` is `true`, so `allowed` becomes `true`. But also `existingEntry.allowed || reasons.length === 0` would yield `false || true` = `true`. Both paths agree here. No actual bug on deeper analysis, but the `wasOnlyLimitBlocked` variable is redundant given the fallback expression. Simplify to: `allowed: existingEntry.allowed || reasons.length === 0`.

**S2. Server-side `AccessEvent` type includes `orgId` but client-side `ClientAccessEvent` for the new events does NOT strip `orgId`.**

Looking at the existing pattern: `access:role_changed` on the server has `userId` but the client type strips it (just `{ type: 'access:role_changed' }`). Similarly, `access:plan_changed` on the server has `orgId` but the client strips it. However, the NEW event types (`plan_assigned`, `addon_attached`, etc.) on the client side include `planId`, `addonId`, `entitlement`, `max` but no `orgId` -- which is correct and follows the pattern. But I note that the server `AccessEvent` for `limit_reset` includes both `orgId` AND `entitlement`/`max`, while the client receives only `entitlement`/`max`. The JSON parsing in the client just does `JSON.parse(event.data) as ClientAccessEvent`. If the server sends `orgId` in the payload, the client object will contain `orgId` at runtime even though the TypeScript type doesn't declare it. This is harmless but worth noting for type purity.

**S3. No `.test-d.ts` file for Phase 7.**

Per TDD rules, phases with new type additions should include type-level tests. The `AccessEvent` and `ClientAccessEvent` unions were extended, and the `AccessEventBroadcaster` interface gained new methods. Type-level tests would verify that, for example, calling `broadcaster.broadcastPlanAssigned('org-1')` without the `planId` argument is a compile error.

### Observations

**O1.** The `decodeAccessSet` test verifies round-trip but does not test that `project:export` (which has a `flags: ['export-v2']` requirement) is handled correctly in the decoded set. Since no flag store is provided in the test, `project:export` may be denied for flag reasons, not plan reasons. The test only checks the first 3 entitlements, not `project:export`.

**O2.** The `plan change updates access set hash` test compares stringified encoded sets. This is fragile -- JSON key ordering is not guaranteed across implementations. A more robust test would compare specific fields.

**O3.** The `AccessSet` type on both server and client has `plan: string | null`. The `handlePlanAssigned` sets it to a `planId` string. There is no validation that `planId` corresponds to a defined plan in the access config. This is acceptable for advisory client-side use but could lead to confusing state.

## Verdict

**Changes Requested.**

B1 is a correctness issue. The `plan_assigned` handler creates an inconsistent state where `accessSet.plan` says "pro" but `accessSet.entitlements` still reflects the "free" plan. This will cause UI inconsistencies. Either make `plan_assigned` trigger a full refetch (like `plan_changed`), or document and test the intended interaction between `plan_assigned` and `plan_changed` events.

S1 should be addressed to simplify the logic. S3 should be addressed per TDD rules.
