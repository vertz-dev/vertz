# Phase 3: Override Store & Overage — Nora Review

- **Reviewer:** nora
- **Date:** 2026-03-09
- **Focus:** API surface quality, DX, schema-to-consumer type flow

## Verdict: Approved with notes

## Findings

### Blockers

None.

### Should Fix

1. **`OverrideStore.remove()` API is awkward for the common case**
   The `remove()` method takes `{ features?: string[]; limits?: string[] }` — you specify which keys to remove. But there's no way to remove a single field from a `LimitOverrideDef` (e.g., remove `max` but keep `add`). The only workaround is to `set()` a new value without `max`, but since `set()` does a shallow replace on limits (see ben's note), this requires the caller to know the current state first:
   ```ts
   const current = await store.get('org-1');
   await store.set('org-1', { limits: { prompts: { add: current?.limits?.prompts?.add } } });
   ```
   Consider adding an `update()` method or making `remove()` support field-level removal.

2. **`validateOverrides()` is not called automatically in `overrideStore.set()`**
   The validation function exists but is completely decoupled from the store. Nothing prevents a caller from writing invalid overrides directly via `overrideStore.set('org-1', { features: ['nonexistent'] })`. Either:
   - Document that `validateOverrides()` must be called before `set()`, or
   - Make `InMemoryOverrideStore` accept an `AccessDefinition` in its constructor and validate on `set()`.

   As-is, it's easy to store garbage that silently produces wrong results at check time.

3. **`check()` overage meta is only set when limit is exceeded**
   In `access-context.ts` `check()` (lines 345-395), the `meta.limit.overage` flag is only set when `exceeded` is true and `ws.hasOverage` is true. But for UI purposes, it would be useful to know that overage is *available* on a limit even when the tenant hasn't exceeded it yet — so the UI can show "150/200 used (overage billing enabled)" vs just "150/200 used". Currently there's no way to distinguish "this limit has overage configured" from "this limit does not" in the `check()` result unless the tenant is already in overage.

4. **Overage config on `LimitDef` is not surfaced in `check()` meta**
   The `DenialMeta.limit` type has `overage?: boolean` but no fields for `overageAmount`, `overagePer`, or `overageCap`. If a frontend wants to show "each additional unit costs $0.01" or "overage capped at $500", it has to re-read the plan definition separately. Consider adding optional overage config fields to the meta.

### Notes

- The `TenantOverrides` interface is clean and minimal. `features?: string[]` and `limits?: Record<string, LimitOverrideDef>` maps well to what an admin panel would display.
- The `add` vs `max` semantic split is intuitive for the common cases: `add: 200` = "give them 200 extra", `max: 1000` = "cap at exactly 1000". Good API design.
- The `can()` and `canAndConsume()` paths both fetch overrides once via `overrideStore.get()` and pass them through — no redundant fetches. Clean.
- Phase 3 scope in the design doc includes "One-off add-on semantics" and "Add-on compatibility (requires)". Add-on compatibility is implemented (`checkAddOnCompatibility` in plan-store.ts), but one-off add-on semantics (a `price.interval: 'one_off'` type exists in the types but I see no special runtime handling for it). This may be intentionally deferred, but the design doc lists it under Phase 3. Worth confirming scope.
