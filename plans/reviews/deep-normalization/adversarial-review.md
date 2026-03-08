# Deep Normalization — Adversarial Review

**Reviewer:** Claude (Technical Feasibility + Implementation Quality)
**Date:** 2026-03-08
**Design Doc:** plans/domain-grouping.md
**Feature Branch:** `feat/deep-normalization`
**Issue:** #993
**Verdict:** Approved with 2 non-blocking issues and 3 observations

---

## Phase 1: Relation Schema Registry

### 1.1 Module-level mutable singleton — OBSERVATION

`relation-registry.ts` uses a module-level `Map` as the registry. This is the standard pattern for `@vertz/ui` singletons (same as `EntityStore` singleton in `entity-store-singleton.ts`). The registry is populated by codegen-emitted `registerRelationSchema()` calls at module evaluation time, before any components render.

**Risk:** In SSR, the registry persists across requests since it's module-level state. If different requests serve different apps with different schemas, they'd share the registry.

**Assessment:** Not a concern for the current design. The codegen emits the same schema for all requests (it's derived from the API spec, not user data). The `resetRelationSchemas_TEST_ONLY` function exists for test isolation but is correctly not exported from the barrel. No action needed.

### 1.2 Schema freeze is shallow — NON-BLOCKING

`Object.freeze(schema)` in `registerRelationSchema` only freezes the top-level object. The nested `RelationFieldDef` objects (`{ type: 'one', entity: 'users' }`) are NOT frozen:

```typescript
const schema = getRelationSchema('posts')!;
// schema.author is frozen (can't reassign), but:
(schema.author as any).entity = 'hacked'; // succeeds silently
```

This is unlikely to cause bugs in practice since the registry is consumed by `normalizeEntity` and `resolveReferences` which read but never mutate field defs. But it violates the stated intent of `Object.freeze`.

**Recommendation:** Either deep-freeze (iterate fields and freeze each `RelationFieldDef`) or accept the shallow freeze with a comment. Low priority — the `readonly` interface types already prevent this at the TypeScript level.

### 1.3 Test coverage — GOOD

5 tests cover: registration, retrieval, unregistered lookup, freeze verification, overwrite behavior, and reset. Complete.

---

## Phase 2: Write-Side Normalization

### 2.1 `normalizeEntity` returns original reference when no schema — CORRECT

When `getRelationSchema` returns `undefined`, the function returns `{ normalized: data, extracted: new Map() }`. This means `normalized === data` (same reference). This is an intentional optimization — if the entity type has no relations, there's nothing to normalize, so returning the original avoids unnecessary object spread.

The caller (`EntityStore.merge`) proceeds to `_mergeOne(type, normalized)` which does its own `{ ...item }` inside `shallowMerge`, so the original object is never mutated. Safe.

### 2.2 Cycle detection uses `entityType/id` composite key — CORRECT

The visiting set uses `${entityType}/${data.id}` as the key. This correctly handles the case where different entity types could share the same ID (e.g., user `u1` and org `u1`). The `/` separator is safe because entity type names and IDs should never contain `/`.

**Edge case:** If an entity ID contained `/`, the key format could collide. For example, entity type `a`, ID `b/c` produces key `a/b/c`, which collides with entity type `a/b`, ID `c`. In practice, entity IDs are UUIDs or numeric strings, so this is academic.

### 2.3 Normalization happens inside `batch()` — CORRECT

`EntityStore.merge()` wraps the normalization + merge loop in `batch()`. Extracted nested entities are merged via `_mergeOne` before the parent, ensuring that when the parent signal updates, all referenced entities are already in the store. This ordering is important for `resolveReferences` in computeds.

### 2.4 `shallowEqual` element-by-element array comparison — CORRECT

The enhancement to `shallowEqual` in `merge.ts` adds element-by-element comparison for arrays. This prevents unnecessary signal updates when re-normalizing produces the same ID arrays (e.g., `['t1', 't2']` comparing equal to another `['t1', 't2']`).

The comparison uses strict reference equality for each element (`valA[i] !== valB[i]`), which is correct for primitive ID strings. It would also correctly detect changes when array elements are objects with different references.

### 2.5 Duplicate extracted entities in batch merge — OBSERVATION

When merging an array of entities where multiple items reference the same nested entity:

```typescript
store.merge('posts', [
  { id: 'p1', author: { id: 'u1', name: 'John' } },
  { id: 'p2', author: { id: 'u1', name: 'John' } },
]);
```

The normalization extracts `u1` twice, and `_mergeOne` is called twice for it. The second call sees that `u1` already exists with identical data, `shallowEqual` returns `true`, and no signal update fires. This is correct but slightly wasteful — the second `shallowMerge` + `shallowEqual` call is unnecessary.

**Assessment:** Acceptable. The cost is negligible compared to the complexity of deduplicating extracted entities before merge. A future optimization could track extracted IDs to skip duplicates, but not worth it now.

### 2.6 Test coverage — GOOD

14 tests cover: no schema, schema without matching fields, one-relation extraction, bare ID passthrough, null fields, missing ID on nested object, many-relation extraction, string array passthrough, mixed arrays, null many-relation, deep nesting, cycle detection, field preservation, and type grouping. 8 additional tests in `entity-store.test.ts` cover the integration with `_mergeOne`. Comprehensive.

---

## Phase 3: Read-Side Resolution

### 3.1 `resolveReferences` creates reactive dependencies via `store.get().value` — CORRECT

The key design requirement: when used inside a `computed()`, `resolveReferences` creates signal subscriptions by reading `store.get(rel.entity, id).value`. This means when a referenced entity changes, the computed re-evaluates, producing updated denormalized output.

This is verified by the integration test "creates reactive dependency via store.get().value" which:
1. Creates a computed wrapping `resolveReferences`
2. Updates a referenced entity via `store.merge`
3. Asserts the computed reflects the change

### 3.2 Missing referenced entity resolves to `null` (one) / filtered out (many) — DESIGN DECISION

For `one` relations, a bare ID pointing to a missing store entry resolves to `null`. For `many` relations, missing entities are silently filtered out of the array. This asymmetry is intentional:

- `one`: The field must have a value (object or null). Returning `undefined` would be ambiguous with "field not present". `null` signals "relation exists but target is missing."
- `many`: Returning a sparse array with `null` entries would be surprising. Filtering keeps the array clean and matches most UI rendering patterns (`.map()` over items).

This is consistent with how Apollo Client handles missing references.

### 3.3 Already-denormalized passthrough — CORRECT

If a `one` relation field contains an object (not a string), `resolveReferences` passes it through unchanged. This handles the case where data arrives already denormalized (e.g., from a raw API call that bypasses EntityStore normalization). The `many` relation handles this similarly for array elements.

### 3.4 Cycle detection in resolution — CORRECT

Uses the same `${entityType}/${entity.id}` visiting pattern as normalization. When a cycle is detected, the entity is returned as-is (with bare IDs unresolved for the cycled path). This prevents infinite recursion without losing data.

### 3.5 `refKeys` collection is opt-in — CORRECT

The `refKeys` parameter is optional. When provided, it accumulates `${entityType}:${entity.id}` keys for all entities touched during resolution. This is used by the query data computed in Phase 4 for ref counting. When not provided, no overhead.

Note the key format uses `:` as separator (not `/` like the visiting set). This is intentional — `refKeys` are consumed by `splitRefKey` which splits on the first `:`.

**Edge case (same as 2.2):** Entity IDs containing `:` would break `splitRefKey`. Same academic risk as the `/` separator.

### 3.6 Test coverage — GOOD

16 tests including: no schema passthrough, one-relation resolution, missing entity → null, many-relation resolution, missing entity filtering, deep nesting, cycle detection, field preservation, already-denormalized passthrough, refKeys collection (4 tests including transitive), optional refKeys, and reactive dependency verification. Comprehensive.

---

## Phase 4: Reference Counting & Smart Eviction

### 4.1 `addRef` / `removeRef` are no-ops for missing entities — CORRECT

Both methods early-return when `this._entities.get(type)?.get(id)` returns undefined. This is safe because:
- `addRef` might be called before the entity is fetched (query resolved with a reference to an entity that hasn't been merged yet)
- `removeRef` during dispose might target an already-evicted entity

### 4.2 `removeRef` never goes below 0 — CORRECT

```typescript
if (entry.refCount > 0) {
  entry.refCount--;
}
```

The guard prevents negative refCounts from unbalanced `addRef`/`removeRef` calls. This is defensive programming — in normal operation the calls should be balanced, but race conditions or double-dispose scenarios could cause imbalance.

### 4.3 `evictOrphans` preserves entities with pending layers — CORRECT

```typescript
if (
  entry.refCount === 0 &&
  entry.orphanedAt !== null &&
  now - entry.orphanedAt >= maxAge &&
  entry.layers.size === 0  // ← critical guard
) {
```

An entity with a pending optimistic layer must not be evicted — the layer rollback/commit needs the entry to exist. This guard correctly prevents eviction until all layers are resolved.

### 4.4 `evictOrphans` mutates the Map during iteration — NON-BLOCKING

```typescript
for (const [id, entry] of typeMap) {
  if (...) {
    typeMap.delete(id);  // mutating during iteration
    count++;
  }
}
```

In JavaScript, `Map.prototype.delete()` during `for...of` iteration is explicitly safe per the spec. However, it's a pattern that can surprise readers. A comment noting this is spec-safe would be helpful.

**Assessment:** Functionally correct. No action required — just a readability observation.

### 4.5 `updateRefCounts` in query.ts — CORRECT

The diff-based approach (compare old vs new refKeys) is elegant:
- Keys in `oldKeys` but not `newKeys` → `removeRef` (entity no longer referenced)
- Keys in `newKeys` but not `oldKeys` → `addRef` (entity newly referenced)
- Keys in both → no change

The function mutates `oldKeys` in place (clears and repopulates) to act as the "previous" set for the next computed evaluation. This avoids allocating a new Set each time.

### 4.6 `dispose()` cleans up ref counts — CORRECT

```typescript
if (referencedKeys.size > 0) {
  const store = getEntityStore();
  for (const key of referencedKeys) {
    const [type, id] = splitRefKey(key);
    store.removeRef(type, id);
  }
  referencedKeys.clear();
}
```

On query disposal, all referenced entities get their ref counts decremented. This ensures that when a component unmounts, its queries release their entity references.

### 4.7 `evictOrphans` does not notify type change listeners — OBSERVATION

When `evictOrphans` removes an entity, it sets `signal.value = undefined` and deletes from the Map, but does NOT call `_notifyTypeChange`. Compare with `remove()` which does call it:

```typescript
// remove() does this:
this._notifyTypeChange(type);

// evictOrphans does NOT
```

This is likely intentional — eviction is a background cleanup, not a user-triggered action. Type change listeners drive UI (e.g., list re-rendering on create/delete), and eviction of unreferenced entities shouldn't trigger list re-renders.

However, this means `store.size(type)` and `store.has(type, id)` will reflect the eviction, but `onTypeChange` subscribers won't be notified. If a subscriber relies on `onTypeChange` to keep its state in sync with `size()`, it could become stale after eviction.

**Assessment:** Acceptable for v1. Eviction is for memory management, not data flow. If this becomes a problem, `evictOrphans` can be extended to notify. Low risk.

### 4.8 Test coverage — GOOD

12 reference counting tests + 8 eviction tests. Covers: increment, double increment, orphanedAt clearing, no-op on missing entity, decrement, orphanedAt setting, no-below-zero guard, no-op on missing (removeRef), partial decrement, inspect fields, new entity defaults, placeholder defaults. Eviction covers: basic eviction, maxAge respect, refCount guard, layer guard, signal undefined, query index cleanup, count return, empty store. Comprehensive.

---

## Phase 5: Codegen Integration

### 5.1 `generateRelationManifest` is pure — CORRECT

Takes `CodegenEntityModule[]`, returns `RelationManifestEntry[]`. No side effects, no state. Clean separation from the code generation in `ClientGenerator`.

### 5.2 `registerRelationSchema` calls emitted before `createClient` — CORRECT

The generated `client.ts` places `registerRelationSchema` calls after imports but before the `createClient` function definition. This ensures the relation registry is populated at module evaluation time, before any component can call `createClient()` and start querying.

### 5.3 Conditional imports from `@vertz/ui` — CORRECT

The generator conditionally imports `registerRelationSchema` from `@vertz/ui` only when entities have relations. This avoids pulling in `@vertz/ui` as a dependency for projects that don't use relations.

The import is combined with the existing `createOptimisticHandler` / `getEntityStore` import when both are needed:

```typescript
import { createOptimisticHandler, getEntityStore, registerRelationSchema } from '@vertz/ui';
```

### 5.4 `CodegenRelation` type is optional — CORRECT

`relations?: CodegenRelation[]` in `CodegenEntityModule`. The `?` means existing IR without relations continues to work. The `generateRelationManifest` function handles `entity.relations ?? []` with the nullish coalescing.

### 5.5 Test coverage — GOOD

6 tests in `relation-manifest-generator.test.ts` + 4 new tests in `client-generator.test.ts`. The client generator tests cover: import emission, `registerRelationSchema` call generation, ordering (before createClient), and no-import when no relations. Solid.

---

## Cross-Cutting Concerns

### C.1 No barrel export for `resolveReferences` or `normalizeEntity` — CORRECT

These are internal implementation details. `resolveReferences` is consumed by `query.ts` (same package). `normalizeEntity` is consumed by `entity-store.ts` (same package). Neither should be public API.

The only public exports added are `registerRelationSchema`, `getRelationSchema`, `RelationFieldDef`, and `RelationSchema` — all from the relation registry. These are the codegen-facing API.

### C.2 Separator format inconsistency between visit keys and ref keys

- Normalization/resolution visiting set: `${entityType}/${id}`
- Ref counting keys: `${entityType}:${id}`

Two different formats for essentially the same concept. Not a bug (they serve different purposes and never interact), but worth noting for future maintainers.

### C.3 `resolveReferences` called inside `list` computed creates N `store.get().value` subscriptions

For a list query with 100 items, the `data` computed calls `store.get(entityType, id).value` for each item. If each item has 2 one-relations, that's 300 signal subscriptions per computed evaluation. If any of those 300 entities change, the entire computed re-evaluates and re-resolves all 100 items.

This is the expected behavior — computed granularity is per-query, not per-entity. A future optimization could introduce per-entity computeds, but that adds significant complexity (one computed per entity × per query). The current approach is correct and the performance is acceptable for typical list sizes (< 1000 items).

### C.4 Integration test coverage — GOOD

3 integration tests in `deep-normalization.integration.test.ts`:
1. Cross-entity reactive propagation (updating shared author updates all computeds)
2. Memory efficiency (100 posts with same author = 1 user entry)
3. Field enrichment (progressive enrichment via multiple merges)

These tests exercise the full write→store→read pipeline.

---

## Verdict

**Approved** — no blocking issues. The implementation is clean, well-tested, and follows the design.

**Non-blocking issues:**
1. Schema freeze is shallow (1.2) — low priority, TypeScript types prevent mutation
2. Map mutation during iteration in `evictOrphans` (4.4) — spec-safe, readability comment optional

**Observations (no action needed):**
1. SSR singleton sharing (1.1) — not a concern for current design
2. Duplicate extracted entities in batch merge (2.5) — acceptable tradeoff
3. `evictOrphans` does not notify type change listeners (4.7) — intentional for v1
