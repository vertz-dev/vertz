# Phase 2: Plans + Limits + Billing Foundations

**Prerequisites:** [Phase 1 — Entity Restructuring](./phase-01-entity-restructuring.md)

**Goal:** Implement plan definitions (features, limits, gates, scope), plan validation rules, wallet store updates, `canBatch()` (replacing `canAll()`), multi-limit resolution, and add-ons with additive semantics.

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: Plans, Limits, Multi-limit Resolution, Add-ons, Seats, `can()` Resolution Flow, Performance.

---

## Context — Read These First

- `packages/server/src/auth/define-access.ts` — Phase 1 output (new shape)
- `packages/server/src/auth/access-context.ts` — Phase 1 output (updated resolution)
- `packages/server/src/auth/plan-store.ts` — current `InMemoryPlanStore`
- `packages/server/src/auth/wallet-store.ts` — current `InMemoryWalletStore`
- `packages/server/src/auth/billing-period.ts` — current billing period helpers
- `packages/server/src/auth/__tests__/access-context.test.ts` — current 5-layer resolution tests
- `packages/integration-tests/src/__tests__/auth-plans-wallet.test.ts` — current plans integration tests

---

## What to Implement

1. **Plan validation rules (12-19)** in `defineAccess()`:
   - Plan `features` must reference defined entitlement keys
   - Limit `gates` must reference a defined entitlement
   - Limit `scope` must reference a defined entity
   - `defaultPlan` must reference a base plan (not an add-on)
   - `price.interval` must be valid
   - Add-on limit keys must match existing base plan limit keys
   - Base plans must have `group`; add-ons must NOT
   - `limit.max` must be integer; `-1` (unlimited) and `0` (disabled) valid; other negatives invalid

2. **Plan resolution in `can()` flow** — add plan feature check (layer 3) and limit check (layer 4) to the 7-layer evaluation order:
   ```
   1. auth → 2. flags → 3. plan features → 4. limits → 5. roles → 6. attribute rules → 7. step-up
   ```

3. **Structured `scope` field** on limits — tenant-level (no scope) vs per-entity-instance (`scope: 'brand'`). Wallet keys include scope: `{limitKey}:{tenantId}` or `{limitKey}:{tenantId}:{entityType}:{entityId}`.

4. **Multi-limit resolution** — when multiple limits gate the same entitlement, ALL must pass. Denial includes the specific limit that blocked.

5. **`canBatch()`** — replaces `canAll()`. Single entitlement across multiple entities with batch semantics:
   - Static layers evaluated once
   - Batch closure store query for ancestor mappings
   - Batch wallet query for limit states

6. **Add-on support** — plans with `addOn: true`:
   - Additive features: `base.features ∪ addon.features`
   - Additive limits: `base.limits + addon.limits` (per matching key)
   - PlanStore tracks active add-ons per tenant

7. **`canAndConsume()` with multi-limit** — atomic CAS across all limits gating the entitlement. All-or-nothing.

8. **Wallet store updates** — support scoped limit keys, multi-limit queries, batch check API.

9. **PlanStore updates** — store active add-ons per tenant, compute effective features/limits.

10. **Remove `canAll()`** — replaced by `canBatch()`.

---

## Files to Modify

```
packages/server/src/auth/
├── define-access.ts          # MODIFY — add plan validation rules 12-19
├── access-context.ts         # MODIFY — add plan/limit layers, canBatch(), remove canAll()
├── plan-store.ts             # MODIFY — add-on assignments, effective plan computation
├── wallet-store.ts           # MODIFY — scoped keys, batch check, multi-limit
├── billing-period.ts         # MODIFY — support new period types (quarter, year, one_off)
├── types.ts                  # MODIFY — PlanDef, LimitDef, AddOnDef types
├── access-set.ts             # MODIFY — include plan features in access set
├── index.ts                  # MODIFY — export updated types, remove canAll
```

### Test Files

```
packages/server/src/auth/__tests__/
├── define-access.test.ts       # ADD — plan validation tests
├── access-context.test.ts      # ADD — plan/limit layer tests, canBatch tests
├── plan-store.test.ts          # REWRITE — add-on assignments, effective plan
├── wallet-store.test.ts        # MODIFY — scoped keys, batch, multi-limit
├── billing-period.test.ts      # MODIFY — new periods

packages/integration-tests/src/__tests__/
├── auth-plans-wallet.test.ts   # REWRITE — new plan shape, add-ons, multi-limit
```

---

## Expected Behaviors to Test

### Plan validation (`define-access.test.ts`)

```typescript
describe('Feature: Plan validation', () => {
  describe('Given plan features referencing undefined entitlement', () => {
    it('throws "Plan \'pro\' feature \'nonexistent:action\' is not a defined entitlement"', () => {})
  })

  describe('Given limit gates referencing undefined entitlement', () => {
    it('throws "Limit \'prompts\' gates \'nonexistent:create\' which is not defined"', () => {})
  })

  describe('Given limit scope referencing undefined entity', () => {
    it('throws "Limit \'prompts_per_brand\' scope \'nonexistent\' is not a defined entity"', () => {})
  })

  describe('Given defaultPlan referencing an add-on', () => {
    it('throws "defaultPlan \'extra_prompts\' is an add-on, not a base plan"', () => {})
  })

  describe('Given base plan without group', () => {
    it('throws "Base plan \'pro\' must have a group"', () => {})
  })

  describe('Given add-on with group', () => {
    it('throws "Add-on \'export_addon\' must not have a group"', () => {})
  })

  describe('Given add-on limit key not in any base plan', () => {
    it('throws "Add-on limit \'nonexistent\' not defined in any base plan"', () => {})
  })

  describe('Given limit max is negative (not -1)', () => {
    it('throws "Limit max must be -1 (unlimited), 0 (disabled), or a positive integer"', () => {})
  })

  describe('Given limit max is -1 (unlimited)', () => {
    it('succeeds', () => {})
  })

  describe('Given limit max is 0 (disabled)', () => {
    it('succeeds', () => {})
  })
})
```

### can() with plan layer (`access-context.test.ts`)

```typescript
describe('Feature: Plan feature check in can()', () => {
  describe('Given tenant on free plan without project:delete feature', () => {
    describe('When checking can("project:delete")', () => {
      it('returns false with reason "plan_required"', () => {})
    })
  })

  describe('Given tenant on pro plan with project:delete feature', () => {
    describe('When checking can("project:delete")', () => {
      it('returns true (plan layer passes)', () => {})
    })
  })
})

describe('Feature: Limit check in can()', () => {
  describe('Given tenant with prompts limit max=50 and consumed=49', () => {
    describe('When checking can("prompt:create")', () => {
      it('returns true (within limit)', () => {})
    })
  })

  describe('Given tenant with prompts limit max=50 and consumed=50', () => {
    describe('When checking can("prompt:create")', () => {
      it('returns false with reason "limit_reached" and meta { key, max, consumed, remaining }', () => {})
    })
  })

  describe('Given tenant with unlimited limit (max=-1)', () => {
    describe('When checking can("prompt:create")', () => {
      it('returns true (unlimited)', () => {})
    })
  })
})

describe('Feature: Multi-limit resolution', () => {
  describe('Given two limits gating prompt:create (tenant-level=50, per-brand=5)', () => {
    describe('When tenant-level is within limit but per-brand is exceeded', () => {
      it('returns false — ALL limits must pass', () => {})
      it('denial meta includes the per-brand limit as the blocker', () => {})
    })
  })
})
```

### canBatch() (`access-context.test.ts`)

```typescript
describe('Feature: canBatch() replaces canAll()', () => {
  describe('Given 3 tasks in the same project', () => {
    describe('When calling canBatch("task:edit", tasks)', () => {
      it('returns Map<string, AccessCheckResult> keyed by entity ID', () => {})
      it('evaluates static layers (flags, plan, features) once', () => {})
      it('performs batch closure store query', () => {})
    })
  })

  describe('Given mixed access (user can edit task-1 but not task-2)', () => {
    describe('When calling canBatch("task:edit", [task1, task2])', () => {
      it('returns true for task-1 and false for task-2', () => {})
    })
  })
})
```

### Add-ons (`access-context.test.ts`, `plan-store.test.ts`)

```typescript
describe('Feature: Add-on support', () => {
  describe('Given tenant on free plan + export add-on', () => {
    describe('When checking can("project:export")', () => {
      it('returns true — add-on unlocks the entitlement', () => {})
    })
  })

  describe('Given tenant on pro plan (100 prompts) + extra_prompts_50 add-on', () => {
    describe('When checking effective limit for prompts', () => {
      it('effective max is 150 (100 + 50)', () => {})
    })
  })

  describe('Given tenant on free plan + export add-on, then downgrade removes plan', () => {
    describe('When checking can("project:export")', () => {
      it('returns true — add-on features are additive regardless of base plan', () => {})
    })
  })
})
```

### canAndConsume() with multi-limit (`access-context.test.ts`)

- [ ] Consumes from all limits gating the entitlement atomically
- [ ] If CAS fails on any limit, entire operation fails (no partial consumption)
- [ ] Consumption fails gracefully when limit is exactly at max

### Integration tests (`auth-plans-wallet.test.ts`)

- [ ] Full flow: defineAccess with plans → assign plan → can() checks features
- [ ] Limit consumption via canAndConsume() decrements wallet
- [ ] Add-on attachment increases effective limits
- [ ] canBatch() returns correct results for mixed-access entities
- [ ] Plan with no limits — pure feature gating works

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/server/src/auth/
bun test --filter @vertz/server
bun run typecheck --filter @vertz/server
bun test --filter @vertz/integration-tests
bun run typecheck --filter @vertz/integration-tests
```

---

## Notes

- The 7-layer `can()` evaluation order is: auth → flags → plan features → limits → roles → attribute rules → step-up. Layers 3-4 (plan features, limits) are new in this phase.
- `canBatch()` operates on a single entitlement across multiple entities. For multiple entitlements on one entity, call `can()` multiple times — the preloaded context makes this cheap.
- The `scope` field on limits determines wallet key format: no scope = `{limitKey}:{tenantId}`, with scope = `{limitKey}:{tenantId}:{entityType}:{entityId}`.
- `-1` means unlimited — skip the wallet check entirely for that limit.
- `0` means disabled — always deny at the limit layer.
- The `billing-period.ts` file needs to support `'quarter'` and `'year'` intervals in addition to existing `'month'`, `'day'`, `'hour'`.
- Add `'one_off'` as a valid price interval (for add-ons). One-off limits don't reset.
