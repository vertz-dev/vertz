# Phase 7: Client-Side + UI Components — Mike (Architecture) Review

- **Author:** implementation agent
- **Reviewer:** mike
- **Commits:** d7df226e..4b768c4d
- **Date:** 2026-03-09

## Scope

Architecture alignment between the Phase 7 implementation and the access redesign design doc, cross-cutting concerns between server and client packages, and completeness of the phase deliverables.

## Changes

- Server: broadcaster event types + methods, access set JWT tests with plan features
- Client: event client types, event handler with plan-assigned and limit-reset handlers, reactive cascade tests

## Findings

### Blockers

**B1. Phase is substantially incomplete against the design doc and phase plan.**

The phase plan lists 6 items to implement:

| Item | Status |
|------|--------|
| 1. JWT access set with plans | Partial -- tests added for `computeAccessSet()` with plans, but no new code was added to `access-set.ts` (the plan-aware logic was already there from Phase 2) |
| 2. Client-side `can()` layers | **NOT IMPLEMENTED** -- no `can.ts`, no `access-provider.ts`, no client-side types file |
| 3. Reactive `can()` signal | **NOT IMPLEMENTED** |
| 4. Access event broadcaster updates | Done |
| 5. Billing portal components | Deferred (acceptable per plan) |
| 6. Client-side plan metadata API | **NOT IMPLEMENTED** |

The phase delivered **1 of 4 required items** (item 4) and added verification tests for existing functionality (item 1). The central deliverables -- the client-side reactive `can()` signal (items 2-3) -- are absent.

**Files the plan says to create but were NOT created:**
- `packages/ui/src/auth/can.ts` -- the reactive `can()` function
- `packages/ui/src/auth/access-provider.ts` -- access context provider
- `packages/ui/src/auth/types.ts` -- client-side access types (note: `access-set-types.ts` exists from a prior phase but doesn't cover the `can()` API types)
- `packages/integration-tests/src/__tests__/auth-client-side.test.ts` -- E2E test

**B2. Design deviation: `plan_assigned` handler creates inconsistent client state.**

The design doc's client-side `can()` table says plan features are evaluated from the JWT access set. The `handlePlanAssigned` function updates `accessSet.plan` but leaves `accessSet.entitlements` unchanged. This creates a state where:
- `accessSet.plan` says "pro"
- `accessSet.entitlements['project:delete']` still says `{ allowed: false, reasons: ['plan_required'] }`

The design doc doesn't specify a `plan_assigned` event distinct from `plan_changed`. The phase plan mentions `plan:assigned` as a new event type, but doesn't specify the semantics of the split between `plan_assigned` (metadata-only update) and `plan_changed` (full refetch trigger). This is a design deviation that should be escalated.

The current implementation essentially has two overlapping events for plan changes with no clear documentation of when to use which. If the intent is that `plan_assigned` fires first (to update the label) and `plan_changed` follows (to trigger refetch), this should be documented with a sequence diagram.

### Should-Fix

**S1. Event type proliferation without clear lifecycle documentation.**

After Phase 7, the `AccessEvent` union has 8 members:
1. `flag_toggled` -- inline update
2. `limit_updated` -- inline update
3. `role_changed` -- triggers refetch
4. `plan_changed` -- triggers refetch
5. `plan_assigned` -- partial inline update (new)
6. `addon_attached` -- triggers refetch (new)
7. `addon_detached` -- triggers refetch (new)
8. `limit_reset` -- inline update (new)

The split between "inline update" and "triggers refetch" events is ad-hoc. There is no documentation, JSDoc, or enum that makes this distinction explicit. A developer implementing the caller side needs to know: "after calling `broadcastPlanAssigned()`, do I also need to call `broadcastPlanChange()`? What about after `broadcastAddonAttached()`?"

Add a table or enum categorizing events by their client-side handling strategy:
- **Inline**: handler directly modifies the access set signal
- **Refetch**: caller is responsible for triggering a full access set refetch

**S2. Server and client `AccessEvent` / `ClientAccessEvent` types are duplicated, not shared.**

The `AccessEvent` union in `packages/server/src/auth/access-event-broadcaster.ts` and the `ClientAccessEvent` union in `packages/ui/src/auth/access-event-client.ts` define the same event shapes with minor differences (server includes `orgId`/`userId`, client strips them). There is no shared types package ensuring they stay in sync. As new events are added, drift risk increases. The `access-set-types.ts` file has a comment acknowledging "drift risk" but there is no mechanism to prevent it.

Consider a shared type definition (even just a comment linking the two files) or a `.test-d.ts` that verifies structural compatibility.

**S3. `broadcastPlanAssigned` and `broadcastPlanChange` coexist without clear deprecation path.**

If `plan_assigned` is the new, richer event (carries `planId`), does `plan_changed` become deprecated? Or do they serve different purposes (assignment = metadata, change = trigger refetch)? The architecture should make this explicit. Currently both are exported on `AccessEventBroadcaster` with no guidance.

### Observations

**O1.** The existing `computeAccessSet()` already handles plan features correctly (added in Phase 2). Phase 7's access set tests are verification tests, not driving new implementation. This is fine -- the tests confirm the JWT round-trip works with plan data. But it means the "JWT access set with plans" item is a verification, not a new feature.

**O2.** The `broadcastToOrg` helper is reused by all new broadcast methods. The pattern is consistent and the implementation is trivially correct (create event object, JSON.stringify, broadcast). This is good.

**O3.** The phase introduces a `limit_reset` event that is distinct from `limit_updated`. The semantic difference: `limit_updated` is incremental (consumed changed), `limit_reset` is periodic (consumed goes to 0). This is a valid distinction for billing period resets.

## Verdict

**Changes Requested.**

B1 is the primary concern. The phase is titled "Client-Side + UI Components" but delivers only the server-side event infrastructure. The client-side `can()` signal -- the phase's central deliverable per both the phase plan and the design doc -- is absent. The existing work is solid and correct, but the phase is substantially incomplete.

B2 requires a decision on the `plan_assigned` vs `plan_changed` semantics. Either collapse them into one event, or document the lifecycle clearly.
