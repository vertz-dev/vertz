# AccessEventBroadcaster — Align with (resourceType, resourceId) Pattern

**Issue:** #1944
**Status:** Implemented
**Related:** #1945 (auth_flags alignment), #1943 (OverrideStore/WalletStore alignment), #1787 (multi-level tenancy)

## Audit Summary

All auth stores have migrated to the `(resourceType, resourceId)` pattern:

| Store | Signature | Status |
|-------|-----------|--------|
| FlagStore | `(resourceType, resourceId, flag)` | Done (#1945) |
| SubscriptionStore | `(resourceType, resourceId)` | Done |
| RoleAssignmentStore | `(userId, resourceType, resourceId)` | Done |
| AccessContext.orgResolver | `() => { type, id }` | Done |
| **AccessEventBroadcaster** | **`orgId` (bare string)** | **Gap** |

The broadcaster is the last auth component using bare `orgId`. This causes:

1. **API inconsistency** — callers toggle flags via `flagStore.setFlag('project', 'proj-1', 'beta', true)` then broadcast via `broadcaster.broadcastFlagToggle('org-1', 'beta', true)` — the resource type/ID context is lost.
2. **Information loss** — `AccessEvent.orgId` doesn't tell the client which resource level was affected. In multi-level tenancy, a client can't distinguish account-level vs project-level flag changes.
3. **Caller burden** — the caller must manually resolve the root orgId for routing, even though they already have `(resourceType, resourceId)` from the store call.

## API Surface

### Server — AccessEvent type

```ts
// BEFORE
type AccessEvent =
  | { type: 'access:flag_toggled'; orgId: string; flag: string; enabled: boolean }
  | { type: 'access:limit_updated'; orgId: string; entitlement: string; consumed: number; remaining: number; max: number }
  | { type: 'access:role_changed'; userId: string }
  | { type: 'access:plan_changed'; orgId: string }
  | { type: 'access:plan_assigned'; orgId: string; planId: string }
  | { type: 'access:addon_attached'; orgId: string; addonId: string }
  | { type: 'access:addon_detached'; orgId: string; addonId: string }
  | { type: 'access:limit_reset'; orgId: string; entitlement: string; max: number };

// AFTER — orgId replaced with resourceType + resourceId
type AccessEvent =
  | { type: 'access:flag_toggled'; resourceType: string; resourceId: string; flag: string; enabled: boolean }
  | { type: 'access:limit_updated'; resourceType: string; resourceId: string; entitlement: string; consumed: number; remaining: number; max: number }
  | { type: 'access:role_changed'; userId: string }  // unchanged — user-scoped
  | { type: 'access:plan_changed'; resourceType: string; resourceId: string }
  | { type: 'access:plan_assigned'; resourceType: string; resourceId: string; planId: string }
  | { type: 'access:addon_attached'; resourceType: string; resourceId: string; addonId: string }
  | { type: 'access:addon_detached'; resourceType: string; resourceId: string; addonId: string }
  | { type: 'access:limit_reset'; resourceType: string; resourceId: string; entitlement: string; max: number };
```

### Server — Broadcast methods

```ts
// BEFORE
broadcastFlagToggle(orgId: string, flag: string, enabled: boolean): void;
broadcastLimitUpdate(orgId: string, entitlement: string, consumed: number, remaining: number, max: number): void;
broadcastPlanChange(orgId: string): void;
broadcastPlanAssigned(orgId: string, planId: string): void;
broadcastAddonAttached(orgId: string, addonId: string): void;
broadcastAddonDetached(orgId: string, addonId: string): void;
broadcastLimitReset(orgId: string, entitlement: string, max: number): void;

// AFTER — orgId stays as routing key (first param), resourceType/resourceId added for payload
broadcastFlagToggle(orgId: string, resourceType: string, resourceId: string, flag: string, enabled: boolean): void;
broadcastLimitUpdate(orgId: string, resourceType: string, resourceId: string, entitlement: string, consumed: number, remaining: number, max: number): void;
broadcastPlanChange(orgId: string, resourceType: string, resourceId: string): void;
broadcastPlanAssigned(orgId: string, resourceType: string, resourceId: string, planId: string): void;
broadcastAddonAttached(orgId: string, resourceType: string, resourceId: string, addonId: string): void;
broadcastAddonDetached(orgId: string, resourceType: string, resourceId: string, addonId: string): void;
broadcastLimitReset(orgId: string, resourceType: string, resourceId: string, entitlement: string, max: number): void;
```

### Client — ClientAccessEvent type

```ts
// BEFORE — stripped of orgId
type ClientAccessEvent =
  | { type: 'access:flag_toggled'; flag: string; enabled: boolean }
  | { type: 'access:limit_updated'; entitlement: string; consumed: number; remaining: number; max: number }
  | { type: 'access:role_changed' }
  | { type: 'access:plan_changed' }
  | { type: 'access:plan_assigned'; planId: string }
  | { type: 'access:addon_attached'; addonId: string }
  | { type: 'access:addon_detached'; addonId: string }
  | { type: 'access:limit_reset'; entitlement: string; max: number };

// AFTER — includes resourceType/resourceId for client-side filtering
type ClientAccessEvent =
  | { type: 'access:flag_toggled'; resourceType: string; resourceId: string; flag: string; enabled: boolean }
  | { type: 'access:limit_updated'; resourceType: string; resourceId: string; entitlement: string; consumed: number; remaining: number; max: number }
  | { type: 'access:role_changed' }
  | { type: 'access:plan_changed'; resourceType: string; resourceId: string }
  | { type: 'access:plan_assigned'; resourceType: string; resourceId: string; planId: string }
  | { type: 'access:addon_attached'; resourceType: string; resourceId: string; addonId: string }
  | { type: 'access:addon_detached'; resourceType: string; resourceId: string; addonId: string }
  | { type: 'access:limit_reset'; resourceType: string; resourceId: string; entitlement: string; max: number };
```

### WebSocket connection tracking — NO CHANGE

```ts
// Stays the same — orgId routing is correct for broadcast fan-out
interface AccessWsData {
  userId: string;
  orgId: string;  // Root org from JWT — all connections in same org tree share this
}
```

**Rationale:** WebSocket connections are established with the JWT's `claims.orgId` (the billing root). In multi-level tenancy, ALL resource-level events within an org should reach all org connections. Clients filter locally by `resourceType`/`resourceId`. This is the standard pub/sub fan-out pattern.

### Internal routing

The `orgId` parameter (first position) is **required** on all broadcast methods. It serves as the WebSocket routing key — the broadcaster sends the event to all connections with matching `orgId`.

```ts
// Single-level: orgId and resourceId are the same
broadcastFlagToggle('org-1', 'tenant', 'org-1', 'beta', true);

// Multi-level: orgId routes to the root org, resource identifies the specific level
broadcastFlagToggle('org-1', 'project', 'proj-1', 'beta', true);
```

**Why required (not optional)?** If `orgId` were optional with fallback to `resourceId`, a caller broadcasting for a child resource (e.g., `resourceId: 'proj-1'`) who forgets `orgId` would silently lose the event — `connectionsByOrg.get('proj-1')` returns no matches. Making `orgId` explicit prevents this footgun and aligns with Principle 2 ("one way to do things").

## Manifesto Alignment

- **Principle 2 (One way to do things)** — All auth stores use `(resourceType, resourceId)`. The broadcaster should too. One pattern, no exceptions.
- **Principle 3 (AI agents are first-class)** — An LLM toggling a flag via `flagStore.setFlag('project', 'proj-1', 'beta', true)` should broadcast with the same parameters, not mentally map to a different orgId.
- **Principle 1 (If it builds, it works)** — The typed `resourceType` parameter prevents accidentally passing an orgId where a resource type is expected.

## Non-Goals

- **Connection tracking changes** — WebSocket connections stay keyed by orgId. No hierarchical routing.
- **Ancestor resolution in broadcaster** — The broadcaster doesn't resolve tenant hierarchies. Callers provide routing context.
- **Client-side event filtering** — The handler continues to update a single `AccessSet` regardless of `resourceType`/`resourceId`. Multi-level AccessSet support (one per resource level) is a separate concern. The fields are included in the payload to enable future filtering without a protocol change.

## Unknowns

None identified. The change is mechanical — replacing `orgId` with `(resourceType, resourceId)` in types and method signatures, matching the established pattern.

## POC Results

N/A — no POC needed. The pattern is established in FlagStore, SubscriptionStore, and RoleAssignmentStore.

## Type Flow Map

No generics involved. All parameters are `string`. The type flow is:

```
Server broadcast call → AccessEvent (discriminated union) → JSON.stringify → WebSocket →
JSON.parse → ClientAccessEvent (discriminated union) → handleAccessEvent / caller
```

`resourceType` and `resourceId` flow as plain string fields through the entire chain.

## E2E Acceptance Test

```ts
describe('Feature: AccessEventBroadcaster multi-level resource events', () => {
  describe('Given a broadcaster with two org-1 connections and one org-2 connection', () => {
    describe('When broadcastFlagToggle("org-1", "tenant", "org-1", "beta", true) is called (single-level)', () => {
      it('Then org-1 connections receive event with resourceType="tenant" and resourceId="org-1"', () => {});
      it('Then org-2 connections receive nothing', () => {});
    });

    describe('When broadcastFlagToggle("org-1", "project", "proj-1", "beta", true) is called (multi-level)', () => {
      it('Then routes to org-1 connections (orgId is the routing key)', () => {});
      it('Then event payload contains resourceType="project" and resourceId="proj-1"', () => {});
      it('Then org-2 connections receive nothing', () => {});
    });

    describe('When broadcastPlanAssigned("org-1", "account", "org-1", "enterprise") is called', () => {
      it('Then org-1 connections receive event with resourceType="account" and resourceId="org-1"', () => {});
    });

    describe('When broadcastRoleChange(userId) is called', () => {
      it('Then behavior is unchanged — routes by userId, no resource fields', () => {});
    });
  });

  // @ts-expect-error — old 3-arg signature should not compile
  broadcaster.broadcastFlagToggle('org-1', 'beta', true);
});
```

## Implementation Plan

### Phase 1: Server-side type and method alignment

**Changes:**
1. Update `AccessEvent` type — replace `orgId` with `resourceType`/`resourceId` on all variants (except `role_changed`)
2. Update `AccessEventBroadcaster` interface — update all broadcast method signatures
3. Update `createAccessEventBroadcaster` implementation — update all broadcast functions, add optional `orgId` routing parameter
4. Update all server-side tests

**Acceptance criteria:**
- `AccessEvent` variants use `resourceType`/`resourceId` instead of `orgId`
- All broadcast methods accept `(orgId, resourceType, resourceId, ...)` — orgId required as first param for routing
- `orgId` is used for WebSocket routing, `resourceType`/`resourceId` are included in the event payload
- All existing test behaviors preserved with updated signatures
- Integration test (`packages/integration-tests/src/__tests__/reactive-invalidation.test.ts`) updated
- `bun test packages/server`, `bun run typecheck`, `bun run lint` pass

### Phase 2: Client-side type alignment

**Changes:**
1. Update `ClientAccessEvent` type — add `resourceType`/`resourceId` to all variants (except `role_changed`)
2. Update `handleAccessEvent` — no logic changes needed (it switches on `event.type`, field names are additive)
3. Update client-side tests
4. Update integration tests if any

**Acceptance criteria:**
- `ClientAccessEvent` includes `resourceType`/`resourceId` on all org-scoped variants
- `handleAccessEvent` continues to work unchanged (new fields are pass-through)
- All existing test behaviors preserved
- `bun test packages/ui`, `bun run typecheck`, `bun run lint` pass
- Cross-package typecheck passes: `bun run typecheck`
