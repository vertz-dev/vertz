# Phase 7: Client-Side + UI Components — Nora (Frontend/API) Review

- **Author:** implementation agent
- **Reviewer:** nora
- **Commits:** d7df226e..4b768c4d
- **Date:** 2026-03-09

## Scope

Review of the client-side access event handling for plan lifecycle events, the reactive signal update patterns, and the API surface exposed to developers.

## Changes

- `packages/ui/src/auth/access-event-client.ts` — extended `ClientAccessEvent` union
- `packages/ui/src/auth/access-event-handler.ts` — new `handlePlanAssigned` and `handleLimitReset` handlers
- `packages/ui/src/auth/__tests__/access-event-client.test.ts` — 4 new passthrough tests
- `packages/ui/src/auth/__tests__/reactive-cascade.test.ts` — 6 new reactive cascade tests

## Findings

### Blockers

None.

### Should-Fix

**S1. Naming inconsistency between server and client event types.**

The server broadcaster uses method names like `broadcastPlanAssigned`, `broadcastAddonAttached`, `broadcastAddonDetached`, `broadcastLimitReset`. The event types are `access:plan_assigned`, `access:addon_attached`, `access:addon_detached`, `access:limit_reset`. But the older event type `access:plan_changed` has a corresponding `broadcastPlanChange` (not `broadcastPlanChanged`). This creates an inconsistency:

- `broadcastPlanChange` -> `access:plan_changed` (past tense event, present tense method)
- `broadcastPlanAssigned` -> `access:plan_assigned` (past tense event AND method)

Pick one convention. For events that represent things that already happened (which all of these are), the method should either consistently use past tense (`broadcastPlanAssigned`) or present tense (`broadcastPlanAssign`). The current mix is confusing for developers who need to choose between `broadcastPlanChange` and `broadcastPlanAssigned`.

**S2. `broadcastLimitReset` vs `broadcastLimitUpdate` parameter order inconsistency.**

`broadcastLimitUpdate(orgId, entitlement, consumed, remaining, max)` takes 5 params.
`broadcastLimitReset(orgId, entitlement, max)` takes 3 params.

A developer might expect `broadcastLimitReset` to include `consumed: 0, remaining: max` in the event payload for consistency with `broadcastLimitUpdate`. Instead, the client-side handler infers these values. This works but the asymmetry in the API surface is worth noting -- a developer reading the broadcaster API might wonder why `limit_reset` doesn't include the same fields as `limit_updated`.

**S3. `plan_assigned` vs `plan_changed` -- confusing DX for when to use which.**

The design introduces `plan_assigned` alongside the existing `plan_changed`. From a developer perspective, the question is: when do I call `broadcastPlanAssigned()` and when do I call `broadcastPlanChange()`? Both are available on the broadcaster. The distinction appears to be:

- `plan_changed` -> triggers a full access set refetch on the client
- `plan_assigned` -> updates only the `plan` field on the access set (no entitlement recalculation)

But this distinction is not documented anywhere. A developer who calls `broadcastPlanAssigned` thinking it replaces `broadcastPlanChange` will get subtly broken behavior (plan label updates but entitlements stay stale). Add JSDoc comments explaining when to use each method.

**S4. `AccessEventClient` test boilerplate is repetitive.**

The four new tests in `access-event-client.test.ts` follow an identical pattern: create client, connect, open, send JSON, assert onEvent. This is fine functionally but could benefit from a helper function. Not a correctness issue -- just readability.

### Observations

**O1. No reactive `can()` signal implementation in this phase.**

The phase plan lists "Reactive `can()` signal" as item #3, with example:
```ts
const check = can('task:edit');
check.allowed  // boolean signal
check.reason   // DenialReason | undefined signal
```

This is not implemented in this phase. Only the underlying event handling infrastructure is in place. The `can()` signal API would compose these pieces. This is acceptable if deferred, but should be noted.

**O2. No billing portal components.**

The phase plan lists these as "optional -- can defer individual components." This is fine -- Phase 7 correctly prioritized the event infrastructure.

**O3. No client-side plan metadata API.**

Item #6 in the phase plan ("expose plan metadata for UI consumption") is not implemented. Like the billing portal, this can be deferred.

**O4. The `handleAccessEvent` function is not exported from `@vertz/ui`'s public API.**

Looking at `packages/ui/src/auth/access-event-handler.ts`, this is an internal module. Developers don't call it directly -- it's used internally by the access event client integration. This is correct architecture (internal implementation detail, not public API). But the test file imports it directly, which is fine for unit testing.

## Verdict

**Approved with suggestions.**

No blockers. The event infrastructure is solid and follows existing patterns. S1 and S3 are the most important to address -- naming consistency and documentation of when to use `plan_assigned` vs `plan_changed` will prevent developer confusion. The deferred items (reactive `can()`, billing components, plan metadata API) are acceptable deferrals given the phase note says they're optional.
