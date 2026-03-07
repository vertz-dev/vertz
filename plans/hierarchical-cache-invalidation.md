# Same-Type Query Revalidation via MutationEventBus

> **Status:** Draft — Post-Adversarial Review
> **Authors:** Vinicius (CTO)
> **Date:** 2026-03-07
> **Issue:** [#983](https://github.com/vertz-dev/vertz/issues/983)
> **Related:** `automatic-optimistic-updates.md` (EntityStore, MutationDescriptor, OptimisticHandler), `sdk-query-integration.md` (QueryDescriptor + query() integration)
> **See also:** [#993](https://github.com/vertz-dev/vertz/issues/993) — Deep normalization (cross-entity reactivity, separate future feature)

---

## Problem

When using `query()` in `@vertz/ui`, mutating an entity does not revalidate other queries for the **same entity type**. The EntityStore handles single-entity signal propagation — if you update `tasks/abc`, all queries reading that specific entity auto-update. But:

- **Create**: a new entity isn't in any existing query index — list queries don't know about it
- **Delete**: list queries still reference the removed entity — envelope metadata (`total`) is stale
- **Update with filter change**: a task changing `status: 'todo'` → `status: 'done'` still appears in `query(api.tasks.list({ status: 'todo' }))` because the query index hasn't been refreshed

Developers resort to manual `query.refetch()` calls after mutations — defeating the zero-boilerplate promise.

**Example:**

```tsx
const tasks = query(api.tasks.list({ status: 'todo' }));

const handleCreateTask = async (body: CreateTaskInput) => {
  await api.tasks.create(body);
  // ❌ tasks.data is stale — new task not in the list
  // Developer must manually call tasks.refetch()
};

const handleToggleTask = async (taskId: string) => {
  await api.tasks.update(taskId, { status: 'done' });
  // ❌ task still appears in the 'todo' list — EntityStore updated the entity
  //    but the query index still includes it
  // Developer must manually call tasks.refetch()
};
```

### Cross-entity staleness (deferred)

Cross-entity staleness (e.g., updating a task's title doesn't refresh a project query that embeds task data) is a separate problem solved by deep normalization — tracked in [#993](https://github.com/vertz-dev/vertz/issues/993). This design intentionally does NOT invalidate queries for related entity types. When deep normalization lands, nested entity changes will propagate reactively via signal resolution, without refetching.

---

## API Surface

### Zero-config: it just works

The developer's code doesn't change. After any mutation via the SDK, all active queries for the same entity type automatically revalidate.

```tsx
export function TaskListPage() {
  const tasks = query(api.tasks.list({ status: 'todo' }));

  const handleCreateTask = async (body: CreateTaskInput) => {
    await api.tasks.create(body);
    // ✅ tasks list query revalidates automatically — new task appears
  };

  const handleToggleTask = async (taskId: string) => {
    await api.tasks.update(taskId, { status: 'done' });
    // ✅ tasks list query revalidates — task disappears from 'todo' list
  };

  const handleDeleteTask = async (taskId: string) => {
    await api.tasks.delete(taskId);
    // ✅ tasks list query revalidates — task removed, total updated
  };
}
```

No `refetch()`, no `invalidateQueries()`, no cache key management. Mutate via SDK → same-type queries revalidate.

### Opt-out per mutation

```tsx
// Skip revalidation for a specific call
await api.tasks.update(taskId, body, { skipInvalidation: true });
// ✅ EntityStore still updates the task (same-entity signal propagation)
// ❌ No same-type query revalidation triggered
```

### New types

**`MutationEventBus`** — internal pub/sub for mutation events:

```typescript
// In @vertz/ui — not user-facing
export interface MutationEventBus {
  subscribe(entityType: string, callback: () => void): () => void;
  emit(entityType: string): void;
  clear(): void;
}
```

---

## Architecture

### MutationEventBus — pub/sub for mutation events

A simple, synchronous pub/sub that decouples mutations from queries. Module-level singleton (like EntityStore).

```typescript
// packages/ui/src/store/mutation-event-bus.ts
export function createMutationEventBus(): MutationEventBus {
  const listeners = new Map<string, Set<() => void>>();

  return {
    subscribe(entityType: string, callback: () => void): () => void {
      let set = listeners.get(entityType);
      if (!set) {
        set = new Set();
        listeners.set(entityType, set);
      }
      set.add(callback);
      return () => set!.delete(callback);
    },
    emit(entityType: string): void {
      const set = listeners.get(entityType);
      if (set) {
        for (const cb of set) cb();
      }
    },
    clear(): void {
      listeners.clear();
    },
  };
}
```

The bus is intentionally simple — no event payloads, no filtering, no batching. A mutation happened for entity type X; all subscribers for X revalidate. The EntityStore handles fine-grained entity-level reactivity. The bus handles coarse-grained type-level revalidation.

### Query subscription

When `query()` is created with entity metadata (`_entity`), it subscribes to the mutation event bus for its entity type:

```typescript
// Inside query(), when entity metadata is detected:
if (entityMeta) {
  const bus = getMutationEventBus();
  const unsub = bus.subscribe(entityMeta.entityType, () => {
    revalidate();
  });
  onCleanup(unsub);
}
```

Queries only subscribe to their **own** entity type. This keeps query() simple.

### Mutation emission — same-type only

After a mutation commits, the `OptimisticHandler` emits an event for the mutated entity type:

```typescript
// Inside createOptimisticHandler (extended):
commit(meta, mutationId, data) {
  // ... existing commit logic (applyLayer, commitLayer, etc.)

  // Skip revalidation if opted out
  if (meta.skipInvalidation) return;

  // Same-type revalidation
  const bus = getMutationEventBus();
  bus.emit(meta.entityType);
}
```

**Always emit for all mutation kinds.** EntityStore signal propagation handles single-entity updates reactively, but same-type emission is still needed for correctness:
- **Create**: new entity isn't in any existing query index
- **Delete**: list queries need to reflect the removal (envelope metadata like `total` is stale)
- **Update**: filtered list queries may show stale membership — e.g., a task changing `status: 'todo'` → `status: 'done'` should disappear from `query(api.tasks.list({ status: 'todo' }))`. Without revalidation, the entity updates but remains in the wrong list.

The `inflight` Map deduplicates concurrent fetches for the same cache key, so the extra revalidation for same-type updates is collapsed when entity-backed queries already have an in-flight request.

**Revalidate semantics**: The bus triggers `revalidate()`. Today `revalidate()` is an alias for `refetch()` which clears the cache before re-fetching. This means there may be a brief data gap. A true stale-while-revalidate (fetch in background, replace on success) is a separate improvement — the current behavior is correct, just not optimally smooth.

### Opt-out mechanism

The `MutationMeta` type gains an optional `skipInvalidation` field:

```typescript
// In @vertz/fetch types
export interface MutationMeta {
  entityType: string;
  kind: 'create' | 'update' | 'delete';
  id?: string;
  body?: unknown;
  skipInvalidation?: boolean;  // default: false
}
```

SDK methods thread this from the options argument:

```typescript
await api.tasks.update(taskId, body, { skipInvalidation: true });
// → MutationMeta.skipInvalidation = true
// → handler.commit() skips bus emission
// → EntityStore still updates the task (same-entity signal propagation)
```

### SSR lifecycle

The MutationEventBus follows the same per-request isolation as EntityStore:

- **Module-level singleton:** `getMutationEventBus()` returns a shared instance
- **Per-request reset:** `resetMutationEventBus()` creates a new bus instance (same pattern as `resetEntityStore()` which creates a new `EntityStore()`). Query subscriptions from the previous request are on the old bus instance and are implicitly orphaned — no explicit unsubscribe needed since the old bus is garbage collected.
- **SSR doesn't trigger mutations:** Mutations are client-side only, so the bus is empty during SSR render
- **Reset hook:** `(globalThis as any).__VERTZ_CLEAR_MUTATION_BUS__ = resetMutationEventBus` — called by `ssr-render.ts` alongside `__VERTZ_CLEAR_QUERY_CACHE__` and `__VERTZ_CLEAR_ENTITY_STORE__`

### Invalidation flow walkthrough

```
1. User calls: await api.tasks.update(taskId, { status: 'done' })

2. MutationDescriptor.then() executes:
   a. handler.apply() → EntityStore.applyLayer('tasks', taskId, m1, { status: 'done' })
      → tasks/taskId signal updates immediately → entity-backed 'get' queries auto-update
   b. fetch() → server request

3. Server responds OK:
   a. handler.commit() → EntityStore.commitLayer('tasks', taskId, m1, serverData)
   b. handler.commit() → bus.emit('tasks')
   c. All active tasks queries subscribed to 'tasks' → revalidate()
      → refetch filtered lists → correct membership (task leaves 'todo' list)

4. Result: single entity updated instantly (EntityStore signal),
   list queries revalidate (bus emission)
```

### Create example

```
1. User calls: await api.tasks.create({ title: 'New task', projectId })

2. MutationDescriptor.then() executes:
   a. handler.apply() → no-op for create (Tier 3 deferred)
   b. fetch() → server creates task, returns new entity

3. Server responds OK:
   a. handler.commit() → EntityStore.merge('tasks', serverData)
   b. handler.commit() → bus.emit('tasks')
   c. tasks list queries subscribed to 'tasks' → revalidate()
      → refetch lists → new task appears

4. Result: new entity in store, list queries refreshed
```

---

## Manifesto Alignment

**Explicit over implicit:** The bus emission is triggered by explicit SDK mutations — not by watching for arbitrary state changes. The opt-out mechanism (`{ skipInvalidation: true }`) is explicit.

**One way to do things:** Today developers manually call `query.refetch()` after mutations. This design eliminates that pattern — the framework handles it. There's one way: mutate via SDK → same-type queries revalidate automatically.

**LLM-first:** An LLM writing `await api.tasks.create(body)` doesn't need to know that list queries should refresh. The framework does it. Zero cache management knowledge required.

---

## Non-Goals

- **Cross-entity invalidation** — This design does NOT invalidate queries for related entity types. When a task is updated, project queries that embed task data are NOT revalidated. Cross-entity reactivity is tracked in [#993](https://github.com/vertz-dev/vertz/issues/993) (deep normalization) which solves this via signal resolution rather than refetching.

- **Custom (non-entity) query invalidation** — Only entity-backed queries (those created with `QueryDescriptor` from SDK methods) participate in automatic revalidation. Queries using plain thunks (`query(() => fetch(...))`) are outside the entity system.

- **Debouncing/batching** — If a rapid series of mutations triggers multiple emissions for the same entity type, each triggers a `revalidate()`. The `query()` internals already handle in-flight deduplication (the `inflight` Map), so concurrent revalidations for the same query key are collapsed. No additional batching is needed in the bus.

- **Mutation queuing or offline support** — The bus is synchronous and in-memory. No persistence, no retry, no offline queue.

- **Invalidation map / codegen** — No longer needed. Same-type revalidation doesn't require a relationship map. Cross-entity invalidation will be handled by deep normalization (#993) via reactive signal resolution, not by a codegen'd invalidation map.

---

## Unknowns

### 1. Same-type update invalidation vs EntityStore reactivity — RESOLVED

**Question:** Should same-entity-type updates trigger bus emission?

**Resolution:** Yes — always emit for all mutation kinds. The filtered-list scenario proves this is a correctness requirement, not an optimization choice. A task changing `status: 'todo'` → `status: 'done'` must trigger revalidation of `tasks.list({ status: 'todo' })`, otherwise the task appears in the wrong list. The `inflight` Map deduplicates concurrent fetches, so the extra emission cost is negligible.

### 2. Revalidation deduplication timing — RESOLVED

**Question:** When multiple mutations fire in rapid succession, do revalidations collapse?

**Resolution:** Yes. The `inflight` Map deduplicates concurrent fetches for the same cache key. Rapid emissions naturally collapse. Verify with an integration test in Phase 3.

---

## Type Flow Map

```
OptimisticHandler (commit)
  │
  └── MutationEventBus.emit(meta.entityType)
        │
        └── query() subscription
              → entityMeta.entityType from QueryDescriptor._entity
              → bus.subscribe(entityMeta.entityType, revalidate)
              → On emission: revalidate() → refetch → data signal updates
```

No generic type parameters are introduced in this design. No invalidation map. The bus carries entity type strings only.

---

## E2E Acceptance Test

```typescript
// packages/integration-tests/src/same-type-query-revalidation.test.ts

import { createMutationEventBus, type MutationEventBus } from '@vertz/ui';
import { EntityStore } from '@vertz/ui';
import { createOptimisticHandler } from '@vertz/ui';

describe('Same-Type Query Revalidation', () => {
  // Phase 1: MutationEventBus
  describe('MutationEventBus', () => {
    it('subscribe receives emit for matching entity type', () => {
      const bus = createMutationEventBus();
      const calls: string[] = [];

      bus.subscribe('projects', () => calls.push('projects'));
      bus.subscribe('tasks', () => calls.push('tasks'));

      bus.emit('projects');
      expect(calls).toEqual(['projects']);
    });

    it('unsubscribe stops receiving events', () => {
      const bus = createMutationEventBus();
      const calls: string[] = [];

      const unsub = bus.subscribe('projects', () => calls.push('hit'));
      bus.emit('projects');
      expect(calls).toEqual(['hit']);

      unsub();
      bus.emit('projects');
      expect(calls).toEqual(['hit']); // no new call
    });

    it('clear removes all subscriptions', () => {
      const bus = createMutationEventBus();
      const calls: string[] = [];

      bus.subscribe('projects', () => calls.push('hit'));
      bus.clear();
      bus.emit('projects');
      expect(calls).toEqual([]);
    });
  });

  // Phase 2: OptimisticHandler emits to bus after commit
  describe('OptimisticHandler emits same-type events', () => {
    it('emits same entity type on update commit', () => {
      const bus = createMutationEventBus();
      const store = new EntityStore();

      const handler = createOptimisticHandler(store, {
        mutationEventBus: bus,
      });

      const emitted: string[] = [];
      bus.subscribe('tasks', () => emitted.push('tasks'));
      bus.subscribe('projects', () => emitted.push('projects'));

      store.merge('tasks', { id: '1', title: 'Test' });

      handler.commit(
        { entityType: 'tasks', kind: 'update', id: '1', body: { title: 'New' } },
        'm1',
        { id: '1', title: 'New' },
      );

      // Only same-type emitted — no cross-entity
      expect(emitted).toEqual(['tasks']);
    });

    it('emits same entity type on create commit', () => {
      const bus = createMutationEventBus();
      const store = new EntityStore();

      const handler = createOptimisticHandler(store, {
        mutationEventBus: bus,
      });

      const emitted: string[] = [];
      bus.subscribe('tasks', () => emitted.push('tasks'));

      handler.commit(
        { entityType: 'tasks', kind: 'create', body: { title: 'New' } },
        'm1',
        { id: '2', title: 'New' },
      );

      expect(emitted).toEqual(['tasks']);
    });

    it('emits same entity type on delete commit', () => {
      const bus = createMutationEventBus();
      const store = new EntityStore();

      const handler = createOptimisticHandler(store, {
        mutationEventBus: bus,
      });

      const emitted: string[] = [];
      bus.subscribe('tasks', () => emitted.push('tasks'));

      store.merge('tasks', { id: '1', title: 'Test' });

      handler.commit(
        { entityType: 'tasks', kind: 'delete', id: '1' },
        'm1',
        undefined,
      );

      expect(emitted).toEqual(['tasks']);
    });

    it('skips emission when skipInvalidation is true', () => {
      const bus = createMutationEventBus();
      const store = new EntityStore();

      const handler = createOptimisticHandler(store, {
        mutationEventBus: bus,
      });

      const emitted: string[] = [];
      bus.subscribe('tasks', () => emitted.push('tasks'));

      store.merge('tasks', { id: '1', title: 'Test' });

      handler.commit(
        { entityType: 'tasks', kind: 'update', id: '1', body: { title: 'New' }, skipInvalidation: true },
        'm1',
        { id: '1', title: 'New' },
      );

      expect(emitted).toEqual([]);
      // EntityStore still committed
      expect(store.get('tasks', '1').value).toEqual({ id: '1', title: 'New' });
    });

    it('no emission when handler has no bus (backward compat)', () => {
      const store = new EntityStore();
      const handler = createOptimisticHandler(store);

      store.merge('tasks', { id: '1', title: 'Test' });

      // Should not throw — no bus configured
      handler.commit(
        { entityType: 'tasks', kind: 'update', id: '1', body: { title: 'New' } },
        'm1',
        { id: '1', title: 'New' },
      );

      expect(store.get('tasks', '1').value).toEqual({ id: '1', title: 'New' });
    });
  });

  // Phase 3: query() subscribes to mutation events
  describe('query() integration with MutationEventBus', () => {
    it('entity-backed query revalidates when bus emits for its entity type', async () => {
      const bus = getMutationEventBus();
      let fetchCount = 0;

      const descriptor = createDescriptor({
        thunk: () => {
          fetchCount++;
          return Promise.resolve({ id: '1', title: 'Test' });
        },
        _entity: { entityType: 'tasks', mode: 'get' },
        _key: 'tasks.get.1',
      });

      const q = query(descriptor);
      await flushPromises();
      expect(fetchCount).toBe(1);

      bus.emit('tasks');
      await flushPromises();

      expect(fetchCount).toBe(2);
    });

    it('query unsubscribes from bus on dispose', async () => {
      const bus = getMutationEventBus();
      let fetchCount = 0;

      const descriptor = createDescriptor({
        thunk: () => {
          fetchCount++;
          return Promise.resolve({ id: '1', title: 'Test' });
        },
        _entity: { entityType: 'tasks', mode: 'get' },
        _key: 'tasks.get.1',
      });

      const q = query(descriptor);
      await flushPromises();
      expect(fetchCount).toBe(1);

      q.dispose();

      bus.emit('tasks');
      await flushPromises();
      expect(fetchCount).toBe(1); // unchanged
    });

    it('non-entity query does not revalidate on bus emit', async () => {
      const bus = getMutationEventBus();
      let fetchCount = 0;

      const q = query(() => {
        fetchCount++;
        return Promise.resolve({ custom: 'data' });
      });
      await flushPromises();
      expect(fetchCount).toBe(1);

      bus.emit('tasks');
      await flushPromises();
      expect(fetchCount).toBe(1); // unchanged
    });

    it('rapid emissions collapse via inflight deduplication', async () => {
      const bus = getMutationEventBus();
      let fetchCount = 0;

      const descriptor = createDescriptor({
        thunk: () => {
          fetchCount++;
          return new Promise((r) => setTimeout(() => r({ id: '1', title: 'Test' }), 50));
        },
        _entity: { entityType: 'tasks', mode: 'get' },
        _key: 'tasks.get.1',
      });

      const q = query(descriptor);
      await flushPromises();

      for (let i = 0; i < 5; i++) bus.emit('tasks');
      await flushPromises();

      expect(fetchCount).toBeLessThanOrEqual(2); // initial + 1 revalidation
    });

    it('emit for different entity type does not trigger revalidation', async () => {
      const bus = getMutationEventBus();
      let fetchCount = 0;

      const descriptor = createDescriptor({
        thunk: () => {
          fetchCount++;
          return Promise.resolve({ id: '1', title: 'Test' });
        },
        _entity: { entityType: 'tasks', mode: 'get' },
        _key: 'tasks.get.1',
      });

      const q = query(descriptor);
      await flushPromises();
      expect(fetchCount).toBe(1);

      bus.emit('projects'); // different entity type
      await flushPromises();
      expect(fetchCount).toBe(1); // unchanged
    });
  });
});
```

---

## Implementation Phases

### Phase 1: MutationEventBus

**Scope:** New module in `packages/ui/src/store/`. Self-contained, no other packages change.

**Changes:**
- `mutation-event-bus.ts`: `createMutationEventBus()` factory
- `mutation-event-bus-singleton.ts`: `getMutationEventBus()` / `resetMutationEventBus()` (same pattern as `entity-store-singleton.ts`)
- Export from `packages/ui/src/store/index.ts`

**Files:**
- `packages/ui/src/store/mutation-event-bus.ts` (new)
- `packages/ui/src/store/mutation-event-bus-singleton.ts` (new)
- `packages/ui/src/store/index.ts` (export)

**Acceptance criteria:**
- Integration test: `subscribe` + `emit` delivers to matching entity type
- Integration test: `subscribe` returns unsubscribe function that works
- Integration test: `clear()` removes all listeners
- Integration test: multiple subscribers for same type all receive emit
- Integration test: emit for non-subscribed type is a no-op

### Phase 2: OptimisticHandler emits same-type mutation events

**Scope:** Extend `createOptimisticHandler` to accept an optional bus and emit after commit.

**Changes:**
- `optimistic-handler.ts`: Accept optional `{ mutationEventBus }` config
- On `commit()`: emit `meta.entityType` to bus (all mutation kinds)
- On `commit()`: skip emission if `meta.skipInvalidation === true`
- `@vertz/fetch` `MutationMeta`: Add optional `skipInvalidation?: boolean` field

**Files:**
- `packages/ui/src/store/optimistic-handler.ts`
- `packages/fetch/src/types.ts`

**Acceptance criteria:**
- Integration test: `commit()` with `kind: 'update'` emits same entity type
- Integration test: `commit()` with `kind: 'create'` emits same entity type
- Integration test: `commit()` with `kind: 'delete'` emits same entity type
- Integration test: `commit()` with `skipInvalidation: true` emits nothing
- Integration test: `createOptimisticHandler(store)` (no bus) still works — backward compatible

### Phase 3: query() subscribes to mutation event bus

**Scope:** Extend `query()` to subscribe to the bus when entity metadata is present.

**Changes:**
- `query.ts`: When `entityMeta` is detected, subscribe to `getMutationEventBus()` for `entityMeta.entityType`
- On mutation event: call `revalidate()`
- On `dispose()`: unsubscribe from bus
- SSR: `resetMutationEventBus()` added to per-request reset alongside `clearDefaultQueryCache()` and `resetEntityStore()`

**Files:**
- `packages/ui/src/query/query.ts`
- `packages/ui-server/src/ssr-render.ts` (add bus reset)

**Acceptance criteria:**
- Integration test: entity-backed query revalidates when bus emits for its entity type
- Integration test: query unsubscribes on dispose — no revalidation after dispose
- Integration test: non-entity query does not subscribe to bus
- Integration test: emit for different entity type does not trigger revalidation
- Integration test: rapid emissions collapse via inflight deduplication
- Integration test: SSR — bus is cleared between requests

---

## Verification

After each phase:
```bash
bun test packages/ui/
bun run typecheck --filter @vertz/ui
bunx biome check --write packages/ui/src/
```

After all phases:
```bash
bun test                    # Full test suite
bun run typecheck           # All packages
bun run lint                # Biome check
```
