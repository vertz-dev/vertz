# EntityStore Implementation Spec — v0.1

> **Status:** Draft — Awaiting Review
> **Author:** Mika (VP Eng)
> **Date:** 2026-02-20
> **Design Doc:** `entity-store-design.md` (sections 2, 3, 5, 7, 8, 15.1, 15.3)
> **Package:** `@vertz/ui` (new module: `src/store/`)
> **Depends on:** `@vertz/ui` signal system (signal, computed, effect, batch)

---

## 1. Scope

Implement the core EntityStore for `@vertz/ui`. This is the normalized, signal-backed store that holds entity data on the client and enables SSR hydration.

**In scope (v0.1):**
- `EntityStore` class with `get`, `getMany`, `merge`, `remove`
- Signal-per-entity storage with field-level merge + shallow diff
- `dehydrate()` / `hydrate()` for SSR
- List query result indices (ordered ID arrays per query)
- Type-changed event broadcasting for list invalidation on create/delete
- `createTestStore()` for testing
- Per-request store isolation on server (enforced by API design)

**Out of scope:**
- Compiler integration (field tracing, normalizer generation) — separate track
- `query()` integration — requires codegen SDK, ships with EDA convergence
- Optimistic updates — v0.2
- Real-time integration — v0.2
- Garbage collection — v0.2
- Streaming SSR chunks — v0.2

---

## 2. Public API

```typescript
// --- EntityStore ---

interface EntityStoreOptions {
  /** Initial data to hydrate from (SSR). */
  initialData?: SerializedStore;
}

class EntityStore {
  constructor(options?: EntityStoreOptions);

  /** Read a single entity. Returns a signal that updates on merge. */
  get<T>(type: string, id: string): ReadonlySignal<T | undefined>;

  /** Read multiple entities by IDs. Returns a signal of the array. */
  getMany<T>(type: string, ids: string[]): ReadonlySignal<(T | undefined)[]>;

  /** Merge one or more entities into the store. Field-level merge, shallow diff. */
  merge<T extends { id: string }>(type: string, data: T | T[]): void;

  /** Remove an entity from the store. */
  remove(type: string, id: string): void;

  /** Subscribe to type-level changes (create/delete, not field updates). */
  onTypeChange(type: string, callback: () => void): () => void;

  /** Serialize the store for SSR transfer. */
  dehydrate(): SerializedStore;

  /** Hydrate from serialized data. */
  hydrate(data: SerializedStore): void;

  /** Check if an entity exists in the store. */
  has(type: string, id: string): boolean;

  /** Get count of entities for a type. */
  size(type: string): number;
}

// --- Query Result Index ---

interface QueryResultIndex {
  /** Set the result IDs for a query key. */
  set(queryKey: string, ids: string[]): void;

  /** Get the result IDs for a query key. */
  get(queryKey: string): string[] | undefined;

  /** Remove an entity ID from all indices (after delete). */
  removeEntity(entityId: string): void;

  /** Clear a specific query's index (for revalidation). */
  clear(queryKey: string): void;
}

// --- Serialized Format ---

interface SerializedStore {
  entities: Record<string, Record<string, unknown>>;
  queries?: Record<string, { ids: string[]; nextCursor?: string | null }>;
}

// --- Test Utility ---

/** Create a pre-populated store for testing. */
function createTestStore(data: Record<string, Record<string, unknown>>): EntityStore;
```

---

## 3. Internal Architecture

```
EntityStore
  ├── _entities: Map<string, Map<string, Signal<T>>>
  │     Key: entity type → entity ID → signal holding the data
  │
  ├── _typeListeners: Map<string, Set<() => void>>
  │     Key: entity type → set of callbacks for create/delete events
  │
  ├── _queryIndices: QueryResultIndex
  │     Query key → ordered array of entity IDs
  │
  └── Methods:
        get()       → reads from _entities, creates signal lazily if missing
        getMany()   → computed signal mapping IDs to get() results
        merge()     → field-level merge into existing signal, or create new
        remove()    → delete from _entities + _queryIndices, notify type listeners
        dehydrate() → serialize _entities + _queryIndices to plain JSON
        hydrate()   → bulk merge from serialized data
```

### 3.1 Merge Algorithm

```typescript
merge(type: string, data: T | T[]): void {
  const items = Array.isArray(data) ? data : [data];
  
  batch(() => {  // batch all signal updates
    for (const item of items) {
      const existing = this._entities.get(type)?.get(item.id);
      
      if (existing) {
        const current = existing.peek();  // read without subscribing
        const merged = shallowMerge(current, item);
        
        if (!shallowEqual(current, merged)) {
          existing.value = merged;  // triggers subscribers
        }
        // If shallowEqual → no signal update → no re-renders
      } else {
        // New entity — create signal, notify type listeners
        this._getOrCreateTypeMap(type).set(item.id, signal(item));
        this._notifyTypeChange(type);
      }
    }
  });
}
```

### 3.2 Shallow Merge

```typescript
function shallowMerge<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>): T {
  const result = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (incoming[key] !== undefined) {
      result[key] = incoming[key];
    }
  }
  return result;
}

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;  // strict reference equality
  }
  return true;
}
```

**Merge semantics (important):**
- Fields in `incoming` overwrite fields in `existing`. Fields not in `incoming` are preserved (enrichment, not replacement).
- **Arrays are replaced, not deep-merged.** `merge('User', { id: '42', tags: ['new'] })` replaces the entire `tags` array. This is intentional — arrays don't have identity-based merge semantics. The new array IS the correct state.
- **Nested objects are replaced, not deep-merged.** `merge('User', { id: '42', address: { city: 'NYC' } })` replaces the entire `address` object. Shallow merge operates at the top level only. Deep merge introduces ambiguity (what does it mean to "merge" two address objects?).
- **`undefined` values in incoming are ignored.** Only explicitly set fields overwrite.

### 3.3 Batch and Effect Safety

`merge()` wraps all signal updates in `batch()`. If `merge()` is called inside an existing `batch()` (e.g., from an effect or event handler), the inner `batch()` is a no-op — the outer batch collects all updates. This is safe because our `batch()` implementation supports nesting (inner calls are coalesced into the outer flush).

If `merge()` is called inside an `effect()`, the signal writes are tracked by the effect's scope. To prevent circular re-triggering (merge updates entity → effect re-runs → merge again), `merge()` wraps its signal writes in `untrack()`:

```typescript
merge(type: string, data: T | T[]): void {
  const items = Array.isArray(data) ? data : [data];
  batch(() => {
    for (const item of items) {
      const existing = this._entities.get(type)?.get(item.id);
      if (existing) {
        const current = existing.peek();  // peek = read without subscribing
        const merged = shallowMerge(current, item);
        if (!shallowEqual(current, merged)) {
          untrack(() => { existing.value = merged; });  // write without triggering the calling effect
        }
      } else {
        this._getOrCreateTypeMap(type).set(item.id, signal(item));
        this._notifyTypeChange(type);
      }
    }
  });
}
```

### 3.4 getMany Caching

`getMany()` returns a new computed signal each call. It is **not cached** — callers should store the result in a variable. This matches how `computed()` works elsewhere in @vertz/ui (creating a computed is cheap; the expensive part is the computation, which is memoized by the signal system).

```typescript
getMany<T>(type: string, ids: string[]): ReadonlySignal<(T | undefined)[]> {
  return computed(() => ids.map(id => this.get<T>(type, id).value));
}
```

### 3.3 SSR Isolation

`EntityStore` is instantiated per-request on the server. There is no global/shared instance:

```typescript
// Framework code (inside renderPage):
export async function renderPage(component, options) {
  const store = new EntityStore();  // fresh per request
  // ... render with this store in context ...
  const serialized = store.dehydrate();
  // ... inject into HTML ...
}
```

The store is passed via context (`createContext`), not imported as a module-level singleton. On the client, the app creates one store at boot and hydrates it.

---

## 4. File Structure

```
packages/ui/src/store/
  ├── entity-store.ts          # EntityStore class
  ├── query-result-index.ts    # QueryResultIndex
  ├── merge.ts                 # shallowMerge, shallowEqual utilities
  ├── types.ts                 # SerializedStore, public type exports
  ├── test-utils.ts            # createTestStore
  ├── index.ts                 # public exports
  └── __tests__/
      ├── entity-store.test.ts
      ├── query-result-index.test.ts
      ├── merge.test.ts
      ├── hydration.test.ts
      └── test-utils.test.ts
```

Exported from `@vertz/ui`:
```typescript
export { EntityStore, createTestStore } from './store';
export type { SerializedStore } from './store';
```

---

## 5. Test Plan

### 5.1 EntityStore Core (~25 tests)

**get/has/size:**
- `get` returns undefined signal for missing entity
- `get` returns signal with data after merge
- `get` returns same signal instance on repeated calls (identity stability)
- `has` returns false for missing, true for existing
- `size` returns 0 for empty type, correct count after merges

**merge:**
- Merge single entity creates new entry
- Merge array of entities creates all entries
- Merge existing entity updates signal value
- Merge with new fields enriches (doesn't lose existing fields)
- Merge with unchanged data does NOT trigger signal update (shallow equal check)
- Merge with changed field triggers signal update
- Merge wraps in batch (multiple entities = single reactive flush)
- Merge with `undefined` fields does not overwrite existing fields

**remove:**
- Remove deletes entity signal
- Remove on missing entity is no-op
- Remove triggers type change listeners
- After remove, get returns undefined signal

**getMany:**
- Returns signal of array matching IDs
- Array updates when underlying entities change
- Missing IDs produce undefined in array

**onTypeChange:**
- Fires on merge of new entity (create)
- Fires on remove
- Does NOT fire on merge of existing entity (update)
- Returns unsubscribe function that works
- Multiple listeners on same type all fire

**Edge cases:**
- Merge with empty array is no-op
- Merge entity with array field replaces entire array (not deep merge)
- Merge entity with nested object field replaces entire object (not deep merge)
- Merge called inside an effect does not cause infinite re-trigger
- Merge called inside an existing batch coalesces correctly
- getMany with empty IDs array returns empty signal array
- getMany repeated calls return independent computed signals

### 5.2 Merge Utilities (~10 tests)

- shallowMerge: adds new fields
- shallowMerge: overwrites changed fields
- shallowMerge: preserves untouched fields
- shallowMerge: ignores undefined values in incoming
- shallowEqual: returns true for identical objects
- shallowEqual: returns true for same-value objects
- shallowEqual: returns false for different values
- shallowEqual: returns false for added fields
- shallowEqual: returns false for removed fields
- shallowEqual: handles null and undefined

### 5.3 QueryResultIndex (~8 tests)

- set/get: stores and retrieves ID arrays
- set overwrites existing index
- get returns undefined for missing query
- removeEntity: removes ID from all indices
- removeEntity: no-op if ID not in any index
- clear: removes specific query index
- Ordering is preserved

### 5.4 Hydration (~10 tests)

- dehydrate returns entities as plain objects (not signals)
- dehydrate includes query indices
- hydrate populates store from serialized data
- hydrate + get returns correct signal values
- Hydrate then merge enriches entities
- Dehydrate → hydrate round-trip preserves all data
- Hydrate with empty data is no-op
- Hydrate into non-empty store merges (doesn't replace)
- Multiple entity types in serialized data
- Query indices survive round-trip

### 5.5 createTestStore (~5 tests)

- Creates store pre-populated with entities
- get works immediately after creation
- Supports multiple entity types
- Empty input creates empty store
- Returned store is a real EntityStore (merge/remove work)

**Total: ~65 tests**

---

## 6. Quality Gates

Before PR:
- [ ] `bun run ci` passes (full pipeline — typecheck, lint, test, coverage)
- [ ] All ~58 tests pass
- [ ] No skipped tests
- [ ] Public API matches this spec exactly
- [ ] Exports added to `@vertz/ui` package index

---

## 7. Acceptance Criteria

The EntityStore is ready when:
1. A developer can create a store, merge entities, and read them via signals
2. Merging an entity with new fields enriches (not replaces) the cached entry
3. Signal updates only fire when data actually changes (shallow diff)
4. `dehydrate()` → HTML → `hydrate()` round-trips correctly
5. `createTestStore()` enables unit testing without network calls
6. Type change listeners fire on create/delete but not on update
7. Multiple entity types coexist in one store without interference
