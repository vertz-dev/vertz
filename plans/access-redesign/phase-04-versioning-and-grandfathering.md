# Phase 4: Versioning + Grandfathering

**Prerequisites:** [Phase 2 — Plans + Limits](./phase-02-plans-and-limits.md)

**Goal:** Implement plan version hashing, version store with snapshot persistence, grandfathering policy (grace periods), migration API (`migrate`, `schedule`, `resolve`, `grandfathered`), grandfathering events, and clock injection for testability.

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: Plan Versioning & Grandfathering.

---

## Context — Read These First

- `packages/server/src/auth/define-access.ts` — Phase 1+2 output (defineAccess with plans)
- `packages/server/src/auth/plan-store.ts` — Phase 2 output (plan assignments, add-ons)
- `plans/access-redesign.md` — Versioning, grandfathering, migration API, events

---

## What to Implement

1. **Version hash computation** — SHA-256 of canonical JSON of `{ features, limits, price }` (sorted keys). `title` and `description` excluded.

2. **Plan version store** — `InMemoryPlanVersionStore`:
   - `createVersion(planId, hash, snapshot)` — stores a new version
   - `getCurrentVersion(planId)` — returns latest version number
   - `getVersion(planId, version)` — returns snapshot for a specific version
   - `getTenantVersion(tenantId, planId)` — returns the version a tenant is on

3. **Grandfathering state store** — `InMemoryGrandfatheringStore`:
   - `setGrandfathered(tenantId, planId, version, graceEnds)` — marks tenant as grandfathered
   - `getGrandfathered(tenantId, planId)` — returns grandfathering state
   - `listGrandfathered(planId)` — all grandfathered tenants for a plan
   - `removeGrandfathered(tenantId, planId)` — clears grandfathering state after migration

4. **`access.plans.initialize()`** — on startup/deploy, hash each plan config, compare with stored version, create new version if different. Idempotent.

5. **`access.plans.migrate(planId, opts?)`** — migrate tenants:
   - No opts: migrate all tenants past their grace period
   - `{ tenantId }`: migrate specific tenant immediately
   - Warns if new version has fewer features

6. **`access.plans.schedule(planId, { at })`** — schedule future migration date

7. **`access.plans.resolve(tenantId)`** — return tenant's plan state (planId, version, currentVersion, grandfathered, graceEnds, snapshot)

8. **`access.plans.grandfathered(planId)`** — list all grandfathered tenants

9. **Grandfathering policy** — `grandfathering: { grace }` on plans:
   - Default: 1 billing cycle (monthly→1m, yearly→3m)
   - `'indefinite'`: never auto-migrate
   - Explicit durations: `'1m'`, `'3m'`, `'6m'`, `'12m'`

10. **Clock injection** — `defineAccess({ clock: () => new Date() })` for testable time-dependent behavior (grace period expiration, event timing).

11. **Events** — emitter on `access.plans`:
    - `plan:version_created` — deploy detects plan change
    - `plan:grace_approaching` — 30 days before grace expires
    - `plan:grace_expiring` — 7 days before grace expires
    - `plan:migrated` — tenant moved to new version

12. **Plan resolution uses versioned snapshot** — `can()` uses the tenant's versioned snapshot (features, limits), not the current config. New tenants get the current version.

---

## Files to Create/Modify

```
packages/server/src/auth/
├── plan-version-store.ts       # NEW — InMemoryPlanVersionStore
├── grandfathering-store.ts     # NEW — InMemoryGrandfatheringStore
├── plan-hash.ts                # NEW — canonical JSON hashing
├── define-access.ts            # MODIFY — add clock, plans API, initialize
├── access-context.ts           # MODIFY — resolve tenant's versioned plan snapshot
├── plan-store.ts               # MODIFY — tenant version tracking
├── types.ts                    # MODIFY — PlanVersionInfo, GrandfatheringState types
├── index.ts                    # MODIFY — export new stores and types
```

### Test Files

```
packages/server/src/auth/__tests__/
├── plan-version-store.test.ts   # NEW
├── grandfathering-store.test.ts # NEW
├── plan-hash.test.ts            # NEW
├── access-context.test.ts       # ADD — versioned plan resolution tests
├── define-access.test.ts        # ADD — initialize, version detection tests

packages/integration-tests/src/__tests__/
├── auth-versioning.test.ts      # NEW — full versioning + grandfathering E2E
```

---

## Expected Behaviors to Test

### Plan hash (`plan-hash.test.ts`)

- [ ] Same config produces same hash (deterministic)
- [ ] Different `features` → different hash
- [ ] Different `limits` → different hash
- [ ] Different `price` → different hash
- [ ] Different `title` → same hash (excluded)
- [ ] Different `description` → same hash (excluded)
- [ ] Object key order doesn't affect hash (canonical JSON)

### Plan version store (`plan-version-store.test.ts`)

- [ ] `createVersion()` stores snapshot and returns version number
- [ ] `getCurrentVersion()` returns latest version
- [ ] `getVersion()` returns specific version snapshot
- [ ] `getTenantVersion()` returns version tenant is on
- [ ] Version numbers are sequential (1, 2, 3)

### Grandfathering store (`grandfathering-store.test.ts`)

- [ ] `setGrandfathered()` marks tenant as grandfathered with grace end date
- [ ] `getGrandfathered()` returns grandfathering state
- [ ] `listGrandfathered()` returns all grandfathered tenants for a plan
- [ ] `removeGrandfathered()` clears state after migration

### initialize() and version detection

```typescript
describe('Feature: Plan version detection on initialize()', () => {
  describe('Given first deployment with plans', () => {
    it('creates version 1 for each plan', () => {})
    it('emits plan:version_created event', () => {})
  })

  describe('Given second deployment with unchanged plans', () => {
    it('no new version created (hash matches)', () => {})
    it('no event emitted', () => {})
  })

  describe('Given deployment with changed plan limits', () => {
    it('creates new version', () => {})
    it('existing tenants keep old version (grandfathered)', () => {})
    it('new tenants get new version', () => {})
  })
})
```

### Migration API

```typescript
describe('Feature: Plan migration', () => {
  describe('Given grandfathered tenant past grace period', () => {
    describe('When calling migrate(planId)', () => {
      it('migrates tenant to current version', () => {})
      it('emits plan:migrated event with previousVersion', () => {})
      it('clears grandfathering state', () => {})
    })
  })

  describe('Given grandfathered tenant within grace period', () => {
    describe('When calling migrate(planId)', () => {
      it('does NOT migrate — grace still active', () => {})
    })
  })

  describe('Given migrate with specific tenantId', () => {
    it('migrates immediately regardless of grace', () => {})
  })

  describe('Given new version has fewer features', () => {
    describe('When calling migrate()', () => {
      it('warns but still migrates', () => {})
    })
  })
})
```

### Clock injection

- [ ] `access.plans.migrate()` uses injected clock for grace period comparison
- [ ] Advancing clock past grace → tenant becomes auto-eligible
- [ ] Events fire at correct time relative to clock

### Versioned plan resolution in can()

- [ ] Grandfathered tenant's `can()` uses their version's snapshot
- [ ] New tenant's `can()` uses current version
- [ ] After migration, tenant's `can()` uses new version

---

## Quality Gates

```bash
bunx biome check --write packages/server/src/auth/
bun test --filter @vertz/server
bun run typecheck --filter @vertz/server
bun test --filter @vertz/integration-tests
```

---

## Notes

- This phase can run in parallel with Phase 3 (overrides) since both depend on Phase 2 but not on each other.
- The `access.plans` API is exposed on the `AccessDefinition` return object. It needs access to the version store and grandfathering store — injected via config or defaulting to InMemory implementations.
- Migration semantics: features carry over, new limits apply at next reset window, price changes apply at next billing cycle. Actual billing integration (Stripe proration) is Phase 5.
- The `plan:grace_approaching` (30 days) and `plan:grace_expiring` (7 days) events are computed relative to the clock. They don't fire automatically — they're evaluated when `initialize()` or a periodic check runs.
