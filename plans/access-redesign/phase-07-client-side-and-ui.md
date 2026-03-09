# Phase 7: Client-Side + UI Components

**Prerequisites:** [Phase 2 — Plans + Limits](./phase-02-plans-and-limits.md)

**Goal:** Update the JWT access set to include plan features and limits, implement client-side reactive `can()` with plan awareness, and create billing portal UI components (PricingTable, UsageDashboard, etc.).

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: `can()` Resolution Flow (client-side), Tenant Billing Portal.

---

## Context — Read These First

- `packages/server/src/auth/access-set.ts` — current access set computation and encoding
- `packages/server/src/auth/access-event-broadcaster.ts` — WebSocket invalidation
- `packages/server/src/auth/types.ts` — `SessionPayload`, `AclClaim`
- `packages/server/src/auth/__tests__/access-set-jwt.test.ts` — current JWT encoding tests
- `plans/access-redesign.md` — Client-side `can()` table, Billing Portal

---

## What to Implement

1. **JWT access set with plans** — include plan features, flag states, and role assignments in the JWT `acl` claim. Limits are NOT included (need server count).

2. **Client-side `can()` layers** — evaluate from JWT:
   - Authentication ✅ (from session)
   - Feature flags ✅ (from JWT / WebSocket)
   - Plan features ✅ (from JWT access set)
   - Limits ❌ (need server — always defers to server)
   - Roles ✅ (from JWT access set)
   - Attribute rules ❌ (need entity data — defers to server)
   - Step-up auth ✅ (from JWT `fva` claim)

3. **Reactive `can()` signal** — signal-backed, re-evaluates on WebSocket events:
   ```ts
   const check = can('task:edit');
   check.allowed  // boolean signal
   check.reason   // DenialReason | undefined signal
   ```

4. **Access event broadcaster updates** — broadcast plan change events:
   - `plan:assigned` — tenant's plan changed
   - `plan:addon_attached` / `plan:addon_detached`
   - `limit:consumed` / `limit:reset` (for client-side usage display)

5. **Billing portal components** (optional — can defer individual components):
   - `<PricingTable access={access} />` — shows available plans
   - `<PlanManager access={access} />` — upgrade/downgrade, current plan
   - `<UsageDashboard access={access} />` — consumption vs limits
   - `<AddOnStore access={access} />` — browse/purchase add-ons
   - `<InvoiceHistory access={access} />` — past invoices

6. **Client-side plan metadata API** — expose plan metadata (title, description, price, features) for UI consumption without requiring server calls.

---

## Files to Create/Modify

```
packages/server/src/auth/
├── access-set.ts                # MODIFY — include plan features in access set
├── access-event-broadcaster.ts  # MODIFY — broadcast plan/limit events
├── types.ts                     # MODIFY — update AclClaim with plan features

packages/ui/src/auth/            # NEW directory
├── can.ts                       # NEW — client-side reactive can()
├── access-provider.ts           # NEW — access context provider
├── types.ts                     # NEW — client-side access types

packages/ui/src/billing/         # NEW directory (optional, can defer)
├── pricing-table.tsx            # NEW
├── plan-manager.tsx             # NEW
├── usage-dashboard.tsx          # NEW
├── add-on-store.tsx             # NEW
├── invoice-history.tsx          # NEW
```

### Test Files

```
packages/server/src/auth/__tests__/
├── access-set.test.ts           # ADD — plan features in access set
├── access-set-jwt.test.ts       # ADD — plan features in JWT encoding
├── access-event-broadcaster.test.ts  # ADD — plan/limit events

packages/ui/src/auth/__tests__/
├── can.test.ts                  # NEW — client-side can() tests
├── access-provider.test.ts      # NEW

packages/integration-tests/src/__tests__/
├── auth-client-side.test.ts     # NEW — client-side can() E2E
```

---

## Expected Behaviors to Test

### Access set with plans (`access-set.test.ts`)

- [ ] `computeAccessSet()` includes plan features in the set
- [ ] `computeAccessSet()` includes role assignments
- [ ] `computeAccessSet()` includes feature flags
- [ ] Encoded access set fits within 2KB JWT budget
- [ ] Overflow strategy still works when plan features push set over 2KB

### JWT with plan features (`access-set-jwt.test.ts`)

- [ ] JWT `acl.set` contains plan feature entitlements
- [ ] Decoding JWT restores plan feature entitlements
- [ ] Plan features change → access set hash changes → WebSocket invalidation triggers

### Client-side can()

```typescript
describe('Feature: Client-side reactive can()', () => {
  describe('Given JWT with plan features including project:edit', () => {
    it('can("project:edit").allowed is true', () => {})
  })

  describe('Given JWT without project:export feature', () => {
    it('can("project:export").allowed is false', () => {})
    it('can("project:export").reason is "plan_required"', () => {})
  })

  describe('Given JWT with role "manager" on project', () => {
    it('can("project:delete").allowed is true (role check)', () => {})
  })

  describe('Given limit-gated entitlement', () => {
    it('can("prompt:create").allowed is true (limits defer to server)', () => {})
    it('check result indicates "advisory" — server has final word', () => {})
  })

  describe('Given WebSocket event for plan change', () => {
    it('reactive can() re-evaluates and updates signal', () => {})
  })
})
```

### Access event broadcaster (`access-event-broadcaster.test.ts`)

- [ ] Broadcasts `plan:assigned` when tenant's plan changes
- [ ] Broadcasts `plan:addon_attached` when add-on is attached
- [ ] Client WebSocket receives plan change events
- [ ] Client-side can() re-evaluates on plan change event

---

## Quality Gates

```bash
bunx biome check --write packages/server/src/auth/ packages/ui/src/auth/
bun test --filter @vertz/server
bun test --filter @vertz/ui
bun run typecheck --filter @vertz/server
bun run typecheck --filter @vertz/ui
bun test --filter @vertz/integration-tests
```

---

## Notes

- This phase can run in parallel with Phases 3, 4, 5, and 6 since it only depends on Phase 2.
- The billing portal components are **optional** in this phase. They can be deferred to a follow-up since they're UI-only and don't affect the access system's core functionality. Prioritize the client-side `can()` and access set updates.
- Client-side `can()` for limit-gated entitlements should return `true` (optimistic) since the client doesn't have wallet counts. The server always has the final word. The result should indicate this is advisory.
- The UI components use the `@vertz/ui` component conventions (see `.claude/rules/ui-components.md`). They use `css()` for styling, reactive signals for state, and the router for navigation.
- The `<PricingTable>` component needs plan metadata (title, description, price). This metadata should be exposed via a client-safe API (no server secrets like API keys). Consider a `getPlanMetadata()` function that returns only the public fields.
