# Phase 3: Overrides + Advanced Limits — Nora (Frontend/API) Review

- **Reviewer:** nora
- **Commit:** e8ffe848
- **Date:** 2026-03-09

## Scope

Reviewed the public API surface for Phase 3:

- Override store API (`set`, `remove`, `get`)
- `access.overrides` exposure via `defineAccess()` return object
- `checkAddOnCompatibility()` and `getIncompatibleAddOns()` APIs
- `validateOverrides()` API
- `OverageConfig`, `AddOnRequires`, `LimitOverrideDef`, `TenantOverrides` types
- Export surface in `index.ts` files
- Integration tests (developer-facing usage patterns)

## Findings

### Blockers

**B1. Design doc specifies `access.overrides` API — not implemented.**

The design doc says:
```ts
await access.overrides.set('org-123', { ... });
await access.overrides.remove('org-123', { ... });
const overrides = await access.overrides.get('org-123');
```

This is the `access.overrides` property on the `AccessDefinition` return object. The implementation does NOT expose this. Instead, `InMemoryOverrideStore` is exported as a standalone class and must be instantiated and wired manually by the developer. The Phase 3 plan explicitly says: "`access.overrides` API on the `AccessDefinition` return object — delegates to override store."

This is a significant DX gap. The developer has to:
1. Create an `InMemoryOverrideStore` manually
2. Pass it to `createAccessContext()`
3. Call `validateOverrides()` themselves before `overrideStore.set()`

Instead of the documented single-object API: `access.overrides.set(...)`.

**B2. `remove()` API shape is inconsistent with `set()`.**

`set()` takes `TenantOverrides` which is `{ features?: string[]; limits?: Record<string, LimitOverrideDef> }`.
`remove()` takes `{ features?: string[]; limits?: string[] }`.

The `limits` key has different types in `set` vs `remove`. In `set`, `limits` is a record of objects. In `remove`, `limits` is an array of strings (just the keys). This asymmetry is a DX footgun:

```ts
// Developer might try:
await store.remove('org-1', { limits: { prompts: { max: undefined } } });
// TypeScript would catch this, but the mental model is inconsistent
```

The design doc shows `remove('org-123', { limits: ['prompts'] })` which matches the implementation, but it's still confusing that `limits` means different things in set vs remove.

### Should-Fix

**S1. `validateOverrides()` is not automatically called by `OverrideStore.set()` — easy to bypass validation.**

The design doc's edge cases table implies validation happens at the override layer. But `InMemoryOverrideStore.set()` does zero validation. `validateOverrides()` is a standalone export that the developer must remember to call. A developer could easily write `overrideStore.set('org-1', { limits: { nonexistent: { add: 100 } } })` and it would silently succeed, only to fail at `can()` time (or worse, be silently ignored).

The store should validate on `set()`, or `validateOverrides()` should be called internally. At minimum, document that validation is the caller's responsibility.

**S2. Export comment in `index.ts` says "Phase 9: Override Store" — should be Phase 3.**

Line 2242 in `packages/server/src/auth/index.ts`:
```ts
// Phase 9: Override Store
```

This is Phase 3 work. The comment is confusing for future developers trying to understand the codebase chronology.

**S3. `checkAddOnCompatibility()` returns `true` for unknown add-on IDs.**

If you call `checkAddOnCompatibility(accessDef, 'typo_addon', 'pro')`, it returns `true` because the add-on plan isn't found, so `addOnDef?.requires` is `undefined`, and the function falls through to `return true`. This is technically safe (no false negatives for access) but could mask configuration errors. A developer might misspell an add-on ID and never know their compatibility check is always passing.

**S4. No JSDoc on the public API functions `checkAddOnCompatibility()` and `getIncompatibleAddOns()`.**

These are exported from `@vertz/server` and will be used by developers. They need parameter and return value documentation.

### Observations

**O1.** The `TenantOverrides` interface is clean and minimal. Good API shape.

**O2.** `OverageConfig` is well-structured with clear field names (`amount`, `per`, `cap`). The naming is intuitive.

**O3.** The `requires` field on `PlanDef` is opt-in, which is correct — not all add-ons need compatibility restrictions. Good default-open design.

**O4.** Integration tests use public imports (`@vertz/server`) — correct per project rules.

**O5.** The `DenialMeta.limit.overage` field is a boolean, which is simple and sufficient for UI display. Good design choice over a more complex overage metadata structure.

## Verdict

**Changes Requested** — B1 (`access.overrides` API not implemented) is a clear design doc deviation that affects the developer-facing API. B2 is a DX inconsistency. S1 is a validation gap that will cause runtime surprises.
