# Phase 3: Overrides + Advanced Limits

**Prerequisites:** [Phase 2 — Plans + Limits](./phase-02-plans-and-limits.md)

**Goal:** Implement the override API (`set`, `remove`, `get`), override resolution logic (`add` vs `max`), overage billing config, one-off add-on semantics, and add-on compatibility (`requires`).

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: Overrides, Override Edge Cases, One-off Add-on Semantics, Add-on Compatibility, Limit Overage Billing.

---

## Context — Read These First

- `packages/server/src/auth/access-context.ts` — Phase 2 output (7-layer resolution with plans/limits)
- `packages/server/src/auth/plan-store.ts` — Phase 2 output (add-on assignments, effective plan)
- `packages/server/src/auth/wallet-store.ts` — Phase 2 output (scoped limits, multi-limit)
- `plans/access-redesign.md` — Override edge cases table, one-off semantics, add-on compatibility

---

## What to Implement

1. **Override store** — `InMemoryOverrideStore` with `set()`, `remove()`, `get()` methods. Stores per-tenant feature and limit overrides.

2. **Override resolution in `can()` flow** — effective features/limits include overrides:
   ```
   Effective features = plan.features ∪ addons.features ∪ overrides.features
   Effective limits   = plan.limits + addons.limits + overrides.limits
   ```

3. **Override modes** — `add: N` (additive on top of plan + addons) vs `max: N` (hard cap replacing computed total). `max` takes precedence if both are set.

4. **Override validation** — per the edge cases table:
   - Limit key must match a defined limit → validation error
   - `add: -50` → valid (reduces effective limit)
   - `max: -1` → valid (unlimited override)
   - `max: 0` → valid (disables at limit layer)
   - Negative `max` other than `-1` → validation error
   - Feature override for nonexistent entitlement → validation error

5. **Override removal semantics** — `remove()` clears the specified keys. If both `add` and `max` are set and only `max` is removed, `add` takes effect.

6. **One-off add-on semantics** — add-ons with `price.interval: 'one_off'`:
   - Lifetime addition — +N is permanent, doesn't reset with billing period
   - Stackable — multiple purchases = multiple assignments
   - Persists across plan changes
   - FIFO consumption after base plan periodic allocation

7. **Add-on compatibility** — optional `requires: { group, plans }` on add-ons:
   - Attach validation — add-on can only be attached to tenants on compatible plans
   - Downgrade flagging — when tenant downgrades, incompatible add-ons are flagged (not auto-removed)

8. **Overage billing config** — `overage: { amount, per, cap? }` on limits:
   - When set, `can()` returns `true` even beyond limit
   - `check()` result includes `meta.limit.overage: true`
   - Overage cap hit → hard block
   - Without payment processor adapter, overage config is validation error in production

9. **`access.overrides` API** on the `AccessDefinition` return object — delegates to override store.

---

## Files to Create/Modify

```
packages/server/src/auth/
├── override-store.ts          # NEW — InMemoryOverrideStore
├── define-access.ts           # MODIFY — overage validation, add-on requires validation
├── access-context.ts          # MODIFY — override resolution in effective features/limits
├── plan-store.ts              # MODIFY — one-off add-on tracking, compatibility check
├── wallet-store.ts            # MODIFY — one-off limit persistence (no reset)
├── types.ts                   # MODIFY — OverrideDef, OverageConfig, AddOnRequires types
├── index.ts                   # MODIFY — export OverrideStore, InMemoryOverrideStore
```

### Test Files

```
packages/server/src/auth/__tests__/
├── override-store.test.ts      # NEW
├── access-context.test.ts      # ADD — override resolution tests
├── define-access.test.ts       # ADD — overage + requires validation
├── plan-store.test.ts          # ADD — one-off tracking, compatibility

packages/integration-tests/src/__tests__/
├── auth-plans-wallet.test.ts   # ADD — override + one-off + overage integration tests
```

---

## Expected Behaviors to Test

### Override store (`override-store.test.ts`)

- [ ] `set()` stores feature overrides for a tenant
- [ ] `set()` stores limit overrides with `add` mode
- [ ] `set()` stores limit overrides with `max` mode
- [ ] `get()` returns all overrides for a tenant
- [ ] `get()` returns empty when no overrides exist
- [ ] `remove()` clears specific limit overrides
- [ ] `remove()` clears specific feature overrides
- [ ] `set()` with both `add` and `max` stores both
- [ ] `remove()` of `max` reveals the `add` value

### Override resolution in can() (`access-context.test.ts`)

```typescript
describe('Feature: Override resolution in can()', () => {
  describe('Given tenant on free plan + override features: ["project:export"]', () => {
    it('can("project:export") returns true', () => {})
  })

  describe('Given tenant on pro plan (100 prompts) + override add: 200', () => {
    it('effective limit is 300 (100 base + 200 override)', () => {})
  })

  describe('Given tenant on pro plan + addon +50 + override add: 200', () => {
    it('effective limit is 350 (100 + 50 + 200)', () => {})
  })

  describe('Given tenant with override max: 1000', () => {
    it('effective limit is 1000 regardless of plan + addons', () => {})
  })

  describe('Given tenant with override max: 0 (throttle)', () => {
    it('can() returns false with reason "limit_reached"', () => {})
  })

  describe('Given tenant with override max: -1 (unlimited)', () => {
    it('can() returns true (unlimited)', () => {})
  })

  describe('Given tenant with override add: -50 (reduction)', () => {
    it('effective limit is reduced by 50', () => {})
  })
})
```

### Override validation

- [ ] Override limit key not in any plan → validation error
- [ ] Override feature referencing undefined entitlement → validation error
- [ ] Override `max: -2` → validation error
- [ ] Override `add: -50` → valid
- [ ] Override `max: 0` → valid

### One-off add-on semantics

- [ ] One-off +50 persists across billing period resets
- [ ] Multiple one-off purchases stack (+50 × 2 = +100)
- [ ] One-off allocation persists when base plan changes
- [ ] Consumption uses base plan periodic allocation before one-off

### Add-on compatibility

- [ ] Add-on with `requires` — attaches to compatible plan tenant
- [ ] Add-on with `requires` — rejects attachment to incompatible plan
- [ ] Tenant downgrades → incompatible add-ons flagged (not removed)

### Overage billing

- [ ] Overage config → `can()` returns true beyond limit
- [ ] `check()` includes `meta.limit.overage: true` when in overage
- [ ] Overage cap hit → hard block (`can()` returns false)
- [ ] Overage without payment processor → validation error (production mode)
- [ ] Overage with InMemory store → tracked but not billed (test/dev mode)

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

- The `access.overrides` API is exposed on the `AccessDefinition` return object from `defineAccess()`. It needs store access — the override store is injected via config or defaults to `InMemoryOverrideStore`.
- One-off add-on consumption tracking is more complex than periodic limits. The wallet store needs to distinguish between periodic allocation (resets) and one-off allocation (permanent). Consider separate wallet entries or a `lifetime` flag on the wallet record.
- Overage billing computation (how much to charge) is NOT implemented here — that's Phase 5 (billing integration). This phase only handles the `can()` / `check()` behavior when overage is configured.
