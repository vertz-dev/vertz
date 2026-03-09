# Phase 01 Review — ben (Core/Types)

## Scope
Entity-centric `defineAccess()` rewrite, hierarchy inference, validation rules, backward-compat derived fields.

## Findings

### Blockers
None.

### Should-Fix

1. **`EntityDef.roles` type is `readonly string[] | string[]`** — This union type works but is unusual. The input side should accept `string[]` (mutable), and the output side (`AccessDefinition.entities`) should have `readonly string[]`. Currently the same `EntityDef` interface is used for both input and output, which is a minor type leak. Consider splitting `EntityDef` (input) vs `ResolvedEntityDef` (output) in a follow-up.

2. **`plans` field on `EntitlementDef`** — Added back for backward compat with `access-context.ts` and `access-set.ts` that reference `entDef.plans`. This works (always undefined in Phase 1), but it's a temporary shim. Should be cleaned up when those files are updated in a later phase.

### Observations

- Topological sort via `inferHierarchy()` correctly handles both standalone entities and multi-level chains.
- Cycle detection uses DFS with path tracking — correct algorithm.
- Depth cap at 4 levels matches the spec.
- `Object.freeze()` applied recursively to all output fields — good.
- The backward-compat `roles`, `inheritance`, `hierarchy` fields are correctly derived from the `entities` config, preserving the contract for `resolveInheritedRole()`, `getEffectiveRole()`, etc.
- 31 unit tests in `define-access.test.ts` cover all validation rules.
- Type-level tests verify `@ts-expect-error` on invalid inputs.

### Verdict
**Pass.** Implementation is correct, type-safe, and well-tested. Minor type design improvements can be deferred.
