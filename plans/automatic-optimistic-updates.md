# Automatic Optimistic Updates for Entity Mutations

> **Status:** Draft — Design Review
> **Authors:** Vinicius (CTO)
> **Date:** 2026-03-03
> **Issue:** [#837](https://github.com/vertz-dev/vertz/issues/837)
> **Related:** `sdk-query-integration.md` (QueryDescriptor + query() integration), `entity-driven-architecture.md` (EDA)

---

## Problem

Optimistic updates in vertz are entirely manual. The developer must snapshot state, apply the optimistic patch, await the mutation, and rollback on error — 5+ lines of boilerplate per mutation:

```tsx
// Today — entity-todo/src/components/todo-item.tsx
const handleToggle = async () => {
  const previousValue = isCompleted;
  isCompleted = !isCompleted;  // optimistic

  const result = await api.todos.update(id, { completed: isCompleted });
  if (!result.ok) {
    isCompleted = previousValue;  // rollback
    console.error('Failed to update todo:', result.error.message);
    return;
  }
  onToggle(id, isCompleted);
};
```

This is boilerplate the framework should eliminate. Vertz owns the **entire pipeline** — entity definition → codegen → SDK → query cache — so it has all the information to perform optimistic updates automatically.

The manual pattern also **doesn't propagate**. If `TodoListPage` and `TodoDetailPage` both display the same todo, updating in one doesn't reflect in the other until both refetch. A normalized cache solves this.

## API Surface

### App-level wiring — how EntityStore connects to the SDK

Today, the developer's client setup is a one-liner:

```typescript
// src/api/client.ts (today)
import { createClient } from '#generated';

export const api = createClient();
```

The question: how does the module-level `api` singleton get connected to the EntityStore so that mutations trigger optimistic updates?

**Phase 2-3 (opt-in):** The developer explicitly creates and passes the handler:

```typescript
// src/api/client.ts (Phase 2-3)
import { createClient } from '#generated';
import { getEntityStore, createOptimisticHandler } from '@vertz/ui';

const store = getEntityStore();
const handler = createOptimisticHandler(store);

export const api = createClient({ optimistic: handler });
```

`getEntityStore()` returns the module-level singleton (same instance that `query()` uses internally to normalize entity data). `createOptimisticHandler(store)` wraps it in the `OptimisticHandler` interface that `@vertz/fetch` understands. The generated `createClient` threads the handler to each entity SDK factory.

**Phase 4 (automatic — zero config):** The generated `createClient` does it internally:

```typescript
// src/api/client.ts (Phase 4) — unchanged from today
import { createClient } from '#generated';

export const api = createClient();
```

The generated `createClient` code changes to:

```typescript
// .vertz/generated/client.ts (generated — Phase 4)
import { FetchClient } from '@vertz/fetch';
import { getEntityStore, createOptimisticHandler } from '@vertz/ui';
import { createTodosSdk } from './entities/todos';

export function createClient(options: ClientOptions = {}) {
  const client = new FetchClient({ baseURL: options.baseURL ?? '/api', ... });

  // Auto-wired: EntityStore → OptimisticHandler → SDK factories
  const store = getEntityStore();
  const handler = createOptimisticHandler(store);

  return {
    todos: createTodosSdk(client, handler),
  };
}
```

The developer's `client.ts` stays the same one-liner. Optimistic updates just work because `createClient()` wires the handler internally. The `getEntityStore()` singleton is the same instance that `query()` reads from — so mutations through the SDK instantly update all active queries.

**Component usage stays the same at every phase:**

```typescript
import { api } from '../api/client';

const todosQuery = query(api.todos.list());
// todosQuery.data is backed by EntityStore — updates automatically on any mutation
```

No context providers, no store setup, no configuration. The wiring is:

```
createClient()
  → getEntityStore()           (module-level singleton in @vertz/ui)
  → createOptimisticHandler()  (wraps store in OptimisticHandler interface)
  → createTodosSdk(client, handler)
      → api.todos.update(id, body)
          → handler.apply()    (optimistic layer on EntityStore)
          → fetch              (actual HTTP request)
          → handler.commit()   (on success) / rollback() (on error)

query(api.todos.list())
  → detects _entity metadata   (entityType: 'todos', kind: 'list')
  → normalizes into EntityStore (same singleton)
  → data computed reads from EntityStore
  → any EntityStore change → data recomputes → UI updates
```

### Component-level — before and after

**Update mutation (Tier 1):**

```tsx
// BEFORE — manual optimistic, local state, manual rollback
const handleToggle = async () => {
  const previousValue = isCompleted;
  isCompleted = !isCompleted;
  const result = await api.todos.update(id, { completed: isCompleted });
  if (!result.ok) {
    isCompleted = previousValue;
    console.error('Failed:', result.error.message);
    return;
  }
  onToggle(id, isCompleted);
};

// AFTER — zero boilerplate, automatic optimistic + rollback
const handleToggle = async () => {
  const result = await api.todos.update(id, { completed: !completed });
  if (!result.ok) {
    // EntityStore already rolled back automatically
    console.error('Failed:', result.error.message);
  }
};
```

**Delete mutation (Tier 2):**

```tsx
// BEFORE — manual removal + error handling
const handleDelete = async () => {
  const result = await api.todos.delete(id);
  if (!result.ok) {
    console.error('Failed:', result.error.message);
    return;
  }
  onDelete(id);  // notify parent to remove from list
};

// AFTER — list updates automatically, rollback on error
const handleDelete = async () => {
  const result = await api.todos.delete(id);
  if (!result.ok) {
    // Entity restored in EntityStore + query indices automatically
    console.error('Failed:', result.error.message);
  }
};
```

**Opt-out per mutation:**

```tsx
// Skip optimistic update for a specific call
const result = await api.todos.update(id, body, { optimistic: false });
```

### New types

**`MutationDescriptor<T, E>`** — in `@vertz/fetch`, parallel to `QueryDescriptor`:

```typescript
export interface MutationDescriptor<T, E = FetchError> extends PromiseLike<Result<T, E>> {
  readonly _tag: 'MutationDescriptor';
  readonly _key: string;
  readonly _fetch: () => Promise<Result<T, E>>;
  readonly _mutation: MutationMeta;
  readonly _error?: E;
}

export interface MutationMeta {
  readonly entityType: string;       // 'todos'
  readonly kind: 'update' | 'delete' | 'create';
  readonly id?: string;              // present for update/delete
  readonly body?: unknown;           // the optimistic payload (for update/create)
}
```

**`OptimisticHandler`** — callback interface in `@vertz/fetch`. Decouples `@vertz/fetch` from `@vertz/ui`:

```typescript
export interface OptimisticHandler {
  /** Apply optimistic patch. Returns a rollback function. */
  apply(meta: MutationMeta, mutationId: string): (() => void) | void;
  /** Commit server-confirmed data after successful mutation. */
  commit(meta: MutationMeta, mutationId: string, data: unknown): void;
}
```

**`EntityQueryMeta`** — metadata on `QueryDescriptor` for entity queries:

```typescript
export interface EntityQueryMeta {
  readonly entityType: string;   // 'todos'
  readonly kind: 'get' | 'list';
  readonly id?: string;          // present for 'get'
}

// Extended QueryDescriptor
export interface QueryDescriptor<T, E = FetchError> extends PromiseLike<Result<T, E>> {
  readonly _tag: 'QueryDescriptor';
  readonly _key: string;
  readonly _fetch: () => Promise<Result<T, E>>;
  readonly _entity?: EntityQueryMeta;  // NEW — present for entity SDK queries
  readonly _error?: E;
}
```

### `createMutationDescriptor` factory

```typescript
export function createMutationDescriptor<T>(
  method: string,
  path: string,
  fetchFn: () => Promise<FetchResponse<T>>,
  mutation: MutationMeta,
  handler?: OptimisticHandler,
): MutationDescriptor<T> {
  const key = `${method}:${path}`;
  let mutationId = 0;

  const fetchResult = async (): Promise<Result<T, FetchError>> => {
    const response = await fetchFn();
    if (!response.ok) return response;
    return ok(response.data.data);
  };

  return {
    _tag: 'MutationDescriptor' as const,
    _key: key,
    _mutation: mutation,
    _fetch: fetchResult,
    then(onFulfilled, onRejected) {
      const id = `m_${++mutationId}_${Date.now().toString(36)}`;

      // 1. Apply optimistic update (synchronous)
      const rollback = handler?.apply(mutation, id);

      // 2. Execute fetch
      return fetchResult().then(
        (result) => {
          if (result.ok) {
            handler?.commit(mutation, id, result.data);
          } else {
            rollback?.();
          }
          return onFulfilled?.(result) ?? result;
        },
        (err) => {
          rollback?.();
          if (onRejected) return onRejected(err);
          throw err;
        },
      );
    },
  };
}
```

### Generated `createClient` — what changes

```typescript
// Generated: .vertz/generated/client.ts (Phase 2-3 — opt-in)
import { type OptimisticHandler, FetchClient } from '@vertz/fetch';
import { createTodosSdk } from './entities/todos';

export interface ClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  optimistic?: OptimisticHandler;  // NEW — opt-in wiring point
}

export function createClient(options: ClientOptions = {}) {
  const client = new FetchClient({ baseURL: options.baseURL ?? '/api', ... });
  return {
    todos: createTodosSdk(client, options.optimistic),
  };
}
```

```typescript
// Generated: .vertz/generated/client.ts (Phase 4 — automatic)
import { FetchClient } from '@vertz/fetch';
import { getEntityStore, createOptimisticHandler } from '@vertz/ui';
import { createTodosSdk } from './entities/todos';

export interface ClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  optimistic?: false;  // Only settable to disable — enabled by default
}

export function createClient(options: ClientOptions = {}) {
  const client = new FetchClient({ baseURL: options.baseURL ?? '/api', ... });
  const handler = options.optimistic === false
    ? undefined
    : createOptimisticHandler(getEntityStore());
  return {
    todos: createTodosSdk(client, handler),
  };
}
```

### Generated entity SDK — what changes

```typescript
// Generated: .vertz/generated/entities/todos.ts
import {
  type FetchClient,
  type ListResponse,
  type OptimisticHandler,
  createDescriptor,
  createMutationDescriptor,
} from '@vertz/fetch';

export function createTodosSdk(client: FetchClient, optimistic?: OptimisticHandler) {
  return {
    // Queries — gain _entity metadata
    list: Object.assign(
      (query?: Record<string, unknown>) => createDescriptor(
        'GET', '/todos',
        () => client.get<ListResponse<TodosResponse>>('/todos', { query }),
        query,
        { entityType: 'todos', kind: 'list' },  // NEW
      ),
      { url: '/todos', method: 'GET' as const },
    ),
    get: Object.assign(
      (id: string) => createDescriptor(
        'GET', `/todos/${id}`,
        () => client.get<TodosResponse>(`/todos/${id}`),
        undefined,
        { entityType: 'todos', kind: 'get', id },  // NEW
      ),
      { url: '/todos/:id', method: 'GET' as const },
    ),

    // Mutations — use createMutationDescriptor
    update: Object.assign(
      (id: string, body: UpdateTodosInput, options?: { optimistic?: boolean }) =>
        createMutationDescriptor(
          'PATCH', `/todos/${id}`,
          () => client.patch<TodosResponse>(`/todos/${id}`, body),
          { entityType: 'todos', kind: 'update', id, body },
          options?.optimistic === false ? undefined : optimistic,
        ),
      { url: '/todos/:id', method: 'PATCH' as const },
    ),
    delete: Object.assign(
      (id: string, options?: { optimistic?: boolean }) =>
        createMutationDescriptor(
          'DELETE', `/todos/${id}`,
          () => client.delete<TodosResponse>(`/todos/${id}`),
          { entityType: 'todos', kind: 'delete', id },
          options?.optimistic === false ? undefined : optimistic,
        ),
      { url: '/todos/:id', method: 'DELETE' as const },
    ),
    create: Object.assign(
      (body: CreateTodosInput) => createMutationDescriptor(
        'POST', '/todos',
        () => client.post<TodosResponse>('/todos', body),
        { entityType: 'todos', kind: 'create', body },
        // No optimistic handler for create — Tier 3, deferred
      ),
      {
        url: '/todos',
        method: 'POST' as const,
        meta: { bodySchema: createTodosInputSchema },
      },
    ),
  };
}
```

---

## Architecture

### Optimistic Layer Stack

The core mechanism for safe concurrent mutations. Instead of simple snapshot/rollback (which breaks when mutations overlap), each entity maintains a **base** (server-confirmed truth) and a **stack of optimistic layers** (one per in-flight mutation).

```
EntityEntry for todos/abc-123:
  base: { id: 'abc-123', completed: false, updatedAt: '2026-01-01' }
  layers: Map {
    'm_1_xyz' → { completed: true },
    'm_2_abc' → { title: 'New title' },
  }
  visible (signal.value) = shallowMerge(base, layer1, layer2)
                         = { id: 'abc-123', completed: true, title: 'New title', updatedAt: '2026-01-01' }
```

**Operations:**

| Operation | What happens |
|-----------|-------------|
| `applyLayer(type, id, mutationId, patch)` | Add layer to stack, recompute visible |
| `commitLayer(type, id, mutationId, serverData)` | Set base = serverData, remove layer, recompute visible |
| `rollbackLayer(type, id, mutationId)` | Remove layer only, recompute visible |

**Concurrent mutation walkthrough:**

```
T0: base = { completed: false, updatedAt: '2026-01-01' }, layers = []
    visible = { completed: false, updatedAt: '2026-01-01' }

T1: User toggles ON → applyLayer('todos', 'abc', 'm1', { completed: true })
    layers = [m1: { completed: true }]
    visible = { completed: true, updatedAt: '2026-01-01' }  ← UI updates immediately

T2: User changes title → applyLayer('todos', 'abc', 'm2', { title: 'Buy milk' })
    layers = [m1: { completed: true }, m2: { title: 'Buy milk' }]
    visible = { completed: true, title: 'Buy milk', updatedAt: '2026-01-01' }

T3: M1 server success: { completed: true, updatedAt: '2026-03-03' }
    commitLayer('todos', 'abc', 'm1', serverData)
    base = { completed: true, updatedAt: '2026-03-03' }  ← server truth
    layers = [m2: { title: 'Buy milk' }]
    visible = { completed: true, title: 'Buy milk', updatedAt: '2026-03-03' }

T4: M2 server failure
    rollbackLayer('todos', 'abc', 'm2')
    layers = []
    visible = base = { completed: true, updatedAt: '2026-03-03' }
    ← title reverts, completed stays (confirmed by server)
```

Each layer is independent. Removing one never corrupts another.

**Refetch during pending mutation:** Refetches update the **base** (not the visible state). Layers are reapplied on top. A refetch returning stale data cannot overwrite optimistic state.

### Cache Propagation: Normalized EntityStore

**Analysis: Normalized vs query-key-based patching**

| Criterion | Query-key patching | Normalized (EntityStore) |
|-----------|-------------------|-------------------------|
| Propagation | Must find + patch all affected cache entries | Patch once, all queries auto-update via signals |
| List queries with filters | Must understand filter semantics to find entries | Entity signals update regardless of which list contains them |
| Pagination | Must know which page an entity belongs to | QueryResultIndex tracks IDs per query key |
| Multiple query shapes | `GET:/todos` vs `GET:/todos?status=done` vs `GET:/todos/abc` — all separate entries | One entity signal, consumed by all queries |
| Infrastructure | New query registry needed | EntityStore already exists |
| Concurrency | Per-cache-entry snapshots (same problem as today) | Layer stack on normalized entities |

**Decision: Normalized (EntityStore).** Signal-per-entity gives automatic propagation. The layer stack ensures concurrent safety. QueryResultIndex already handles the ID-to-query-key mapping.

### EntityStore ↔ query() Bridge

The bridge connects `query()` to EntityStore so that entity data changes propagate reactively.

**Source switcher pattern** — keeps `rawData` writable (preserving all 6 existing write sites in `query.ts`), adds a `data` computed that reads from EntityStore when the bridge is active:

```typescript
// Inside query(), when entity metadata is detected:
const rawData: Signal<T | undefined> = signal(undefined);
const entityBacked: Signal<boolean> = signal(false);

// For non-entity queries: data = rawData (no change to existing behavior)

// For entity get queries:
const data = computed(() => {
  if (entityBacked.value) {
    return store.get<T>(entityMeta.entityType, entityMeta.id!).value;
  }
  return rawData.value;
});

// For entity list queries:
const data = computed(() => {
  if (entityBacked.value) {
    const ids = store.queryIndex.get(queryKey);
    if (!ids) return rawData.value;
    const items = ids.map(id => store.get(entityMeta.entityType, id).value).filter(Boolean);
    const envelope = envelopeStore.get(queryKey);
    return envelope ? { ...envelope, items } as T : rawData.value;
  }
  return rawData.value;
});
```

**On entity query resolve** (inside `handleFetchPromise`):

```typescript
if (entityMeta) {
  if (entityMeta.kind === 'get') {
    store.merge(entityMeta.entityType, result as any);
  } else if (entityMeta.kind === 'list') {
    const listResult = result as ListResponse<any>;
    store.merge(entityMeta.entityType, listResult.items);
    store.queryIndex.set(key, listResult.items.map((i: any) => i.id));
    envelopeStore.set(key, {
      total: listResult.total,
      limit: listResult.limit,
      nextCursor: listResult.nextCursor,
      hasNextPage: listResult.hasNextPage,
    });
  }
  rawData.value = result;       // store raw for non-entity fallback
  entityBacked.value = true;    // switch to EntityStore-backed reads
}
```

All 6 existing write sites in `query.ts` continue targeting `rawData`. The `entityBacked` flag only flips once — after the first successful entity fetch. Before that, the query behaves exactly as today.

### List Query Reconstruction — QueryEnvelopeStore

`ListResponse<T>` includes envelope metadata (`total`, `limit`, `nextCursor`, `hasNextPage`) that is not entity data. A simple `Map<queryKey, envelope>` stores this alongside QueryResultIndex:

```typescript
// packages/ui/src/store/query-envelope-store.ts
export interface ListEnvelope {
  total: number;
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export class QueryEnvelopeStore {
  private _envelopes = new Map<string, ListEnvelope>();

  set(key: string, envelope: ListEnvelope): void { this._envelopes.set(key, envelope); }
  get(key: string): ListEnvelope | undefined { return this._envelopes.get(key); }
  delete(key: string): void { this._envelopes.delete(key); }
  clear(): void { this._envelopes.clear(); }
}
```

The list query computed reconstructs `ListResponse<T>` from three sources: EntityStore (items), QueryResultIndex (ordered IDs), QueryEnvelopeStore (envelope metadata).

### Rollback Mechanism

**Update rollback:** Remove the optimistic layer. The layer stack recomputes visible state automatically.

**Delete rollback:** More complex — the entity was removed from EntityStore AND from QueryResultIndex. Both must be restored.

Before removing an entity for optimistic delete, snapshot:
1. The entity data (`store.get(type, id).peek()`)
2. All affected query index entries (`queryIndex.snapshotEntity(id)` — returns `Map<queryKey, string[]>` with full ID arrays)

On rollback, restore both:
```typescript
store.merge(type, entitySnapshot);  // recreate entity
for (const [queryKey, ids] of indexSnapshot) {
  store.queryIndex.set(queryKey, ids);  // restore list positions
}
```

### OptimisticHandler — Package Boundary Contract

`@vertz/fetch` defines the `OptimisticHandler` interface. `@vertz/ui` provides the implementation. The generated `createClient` wires them together. No circular dependency.

```
@vertz/fetch         @vertz/codegen              @vertz/ui
┌──────────────┐    ┌─────────────────────┐    ┌─────────────────────────┐
│ OptimisticHdlr│◄───│ Generated createClient│───►│ createOptimisticHandler │
│ MutationDesc  │    │ passes handler to SDK │    │ uses EntityStore layers  │
│ MutationMeta  │    │ factories             │    │                         │
└──────────────┘    └─────────────────────┘    └─────────────────────────┘
```

`createOptimisticHandler(store: EntityStore)` in `@vertz/ui`:

```typescript
export function createOptimisticHandler(store: EntityStore): OptimisticHandler {
  return {
    apply(meta: MutationMeta, mutationId: string): (() => void) | void {
      if (meta.kind === 'update' && meta.id && meta.body) {
        store.applyLayer(meta.entityType, meta.id, mutationId, meta.body);
        return () => store.rollbackLayer(meta.entityType, meta.id!, mutationId);
      }
      if (meta.kind === 'delete' && meta.id) {
        const entitySnapshot = store.get(meta.entityType, meta.id).peek();
        const indexSnapshot = store.queryIndex.snapshotEntity(meta.id);
        store.removeOptimistic(meta.entityType, meta.id, mutationId);
        return () => store.restoreOptimistic(
          meta.entityType, meta.id!, mutationId, entitySnapshot, indexSnapshot,
        );
      }
    },
    commit(meta: MutationMeta, mutationId: string, data: unknown): void {
      if (meta.kind === 'update' && meta.id) {
        store.commitLayer(meta.entityType, meta.id, mutationId, data);
      }
      // Delete commit: entity already removed, nothing to do
    },
  };
}
```

---

## Tier Coverage

### Tier 1: Update mutations (primary goal)

Covered fully by the design above. `api.<entity>.update(id, payload)` optimistically patches the cached entity via the layer stack, re-renders all consuming queries, and commits or rolls back on server response.

### Tier 2: Delete mutations

`api.<entity>.delete(id)` optimistically removes the entity from EntityStore and all query indices. On error, entity + index positions are restored from pre-removal snapshot.

### Tier 3: Create mutations (deferred)

Adding a newly created entity to cached lists is a hard problem:
- **Filters** — does the new entity match the active list query's filters?
- **Sorting** — where in the list should it appear?
- **Pagination** — which page does it belong to?

The framework could evaluate filters client-side (it knows the entity schema and query params), but sorting and pagination require server knowledge.

**Deferred to a separate design.** For now, `create` mutations return a `MutationDescriptor` with `kind: 'create'` but no optimistic handler is wired. The server response is committed to EntityStore, but list queries are not automatically updated. The developer calls `todosQuery.refetch()` after a successful create — same as today.

---

## Implementation Phases

### Phase 1: Optimistic Layer Stack in EntityStore

**Scope:** Self-contained enhancement to `packages/ui/src/store/entity-store.ts`. No other packages change.

**Changes:**
- Internal `EntityEntry` structure: `{ signal, base, layers: Map<mutationId, patch> }`
- `applyLayer(type, id, mutationId, patch)` — adds layer, recomputes visible
- `commitLayer(type, id, mutationId, serverData)` — updates base, removes layer, recomputes
- `rollbackLayer(type, id, mutationId)` — removes layer, recomputes
- `removeOptimistic(type, id, mutationId)` — removes entity + snapshots index
- `restoreOptimistic(type, id, mutationId, entity, indexSnapshot)` — restores after failed delete
- `inspect(type, id)` — returns `{ base, layers, visible }` for debugging
- `QueryResultIndex.snapshotEntity(id)` — returns affected index entries
- Dev-mode logging behind `__DEV__` flag
- Ref counting: `addRef(type, id)` / `removeRef(type, id)` / orphan timestamp tracking

**Files:**
- `packages/ui/src/store/entity-store.ts`
- `packages/ui/src/store/query-result-index.ts`

**Acceptance criteria:**
- Integration test: apply two overlapping layers to the same entity. Commit first, rollback second. Visible state is correct after each operation.
- Integration test: `inspect()` returns correct base, layers, and visible at each stage.
- Integration test: delete rollback restores entity and query index positions.
- Type test: `applyLayer` rejects non-string mutationId.

### Phase 2: MutationDescriptor + Codegen

**Scope:** New type in `@vertz/fetch`, codegen changes in `@vertz/codegen`.

**Changes in `@vertz/fetch`:**
- `MutationDescriptor<T, E>` interface
- `MutationMeta` interface
- `OptimisticHandler` interface
- `createMutationDescriptor()` factory
- `isMutationDescriptor()` type guard
- `EntityQueryMeta` type + `_entity` field on `QueryDescriptor`
- Extended `createDescriptor()` to accept optional `EntityQueryMeta`

**Changes in `@vertz/codegen`:**
- `EntitySdkGenerator`: emit `createMutationDescriptor` for update/delete/create
- `EntitySdkGenerator`: emit `_entity` metadata on get/list descriptors
- SDK factory signature: `create<Entity>Sdk(client, optimistic?)`

**Files:**
- `packages/fetch/src/descriptor.ts`
- `packages/fetch/src/types.ts`
- `packages/codegen/src/generators/entity-sdk-generator.ts`

**Acceptance criteria:**
- Integration test: `MutationDescriptor` is `PromiseLike<Result<T, E>>`. `await` resolves correctly.
- Integration test: when `OptimisticHandler` is provided, `then()` calls `apply()` before fetch, `commit()` on success, rollback on error.
- Integration test: `isMutationDescriptor()` returns true for mutation descriptors, false for query descriptors.
- Type test: `MutationDescriptor<Todo>._mutation.entityType` is `string`.
- Codegen snapshot test: generated SDK uses `createMutationDescriptor` for update/delete and `createDescriptor` with `_entity` for get/list.

### Phase 3: EntityStore ↔ query() Bridge

**Scope:** Entity queries backed by EntityStore. Enables cross-component propagation.

**Changes in `@vertz/ui`:**
- Module-level `getEntityStore()` singleton + `resetEntityStore()` SSR hook
- `createOptimisticHandler(store)` — returns `OptimisticHandler` using layer stack
- `QueryEnvelopeStore` for list metadata
- `query()` modifications:
  - Detect entity descriptors via `_entity` metadata
  - On resolve: normalize into EntityStore, store envelope, set `entityBacked = true`
  - Source switcher: `data` computed reads from EntityStore when `entityBacked` is true
  - `rawData` remains writable — all existing write sites unchanged
  - SSR: EntityStore reset per-request via `__VERTZ_CLEAR_ENTITY_STORE__` hook
  - Ref counting: increment on query start, decrement on dispose

**Files:**
- `packages/ui/src/query/query.ts`
- `packages/ui/src/store/entity-store.ts`
- `packages/ui/src/store/query-envelope-store.ts` (new)

**Acceptance criteria:**
- Integration test: `query(api.todos.get(id))` populates EntityStore. Externally calling `store.applyLayer()` on that entity causes `query.data` to update reactively.
- Integration test: `query(api.todos.list())` and `query(api.todos.get(id))` for the same entity. Applying a layer updates both query results.
- Integration test: list query data includes correct envelope metadata (`total`, `limit`, etc.).
- Integration test: SSR — EntityStore is cleared between requests. Client hydration populates EntityStore correctly.
- Integration test: entity persists in store after query disposal. Re-mounting the query serves cached data immediately.

### Phase 4: Auto-Optimistic SDK Methods

**Scope:** Zero-boilerplate. SDK mutation methods auto-trigger optimistic updates.

**Changes:**
- Generated `createClient` automatically creates + wires `OptimisticHandler` from `getEntityStore()`
- Import `createOptimisticHandler` from `@vertz/ui` in generated client
- `MutationDescriptor.then()` calls handler by default when handler is provided
- Opt-out: `api.todos.update(id, body, { optimistic: false })` passes `undefined` handler
- SDK method signatures: `update(id, body, options?)`, `delete(id, options?)`
- Dev-mode logging enabled by default

**Files:**
- `packages/codegen/src/generators/entity-sdk-generator.ts`
- `packages/codegen/src/generators/client-generator.ts`
- `examples/entity-todo/src/components/todo-item.tsx` (simplify)

**Acceptance criteria:**
- Integration test: `await api.todos.update(id, { completed: true })` causes `query(api.todos.get(id)).data.completed` to be `true` immediately (before server responds).
- Integration test: server failure rolls back — `query.data.completed` reverts to original.
- Integration test: `{ optimistic: false }` suppresses optimistic update.
- Integration test: two concurrent mutations on the same entity resolve correctly (layer stack).
- entity-todo example: `todo-item.tsx` uses the new pattern with zero manual state management.

---

## SSR Lifecycle

EntityStore follows the same per-request isolation pattern as the query cache:

- **Module-level singleton:** `getEntityStore()` returns a shared instance (like `defaultCache` in `query.ts`)
- **Per-request reset:** `resetEntityStore()` registered as `__VERTZ_CLEAR_ENTITY_STORE__`. Called by ui-server alongside `__VERTZ_CLEAR_QUERY_CACHE__` before each request.
- **SSR discovery pass:** Entity queries populate EntityStore on resolve (same as MemoryCache population)
- **SSR render pass:** EntityStore has data, queries serve from it
- **Client hydration:** EntityStore supports `hydrate()` / `dehydrate()` already. Server dehydrates EntityStore into the SSR payload. Client hydrates before rendering.
- **Coordination:** EntityStore hydration happens alongside MemoryCache hydration in the same SSR data payload (`window.__VERTZ_SSR_DATA__`)

---

## Debugging & Dev Tools

**Dev-mode console logging** (behind `__DEV__` / `import.meta.env.DEV`):

```
[vertz:store] optimistic:apply todos/abc-123 m_1_k7x { completed: true }
[vertz:store] optimistic:commit todos/abc-123 m_1_k7x (server confirmed)
[vertz:store] optimistic:rollback todos/abc-123 m_2_p3q (mutation failed)
[vertz:store] layers todos/abc-123: base={completed:false,updatedAt:'...'} + [m_1_k7x:{completed:true}]
```

**Programmatic inspection:**

```typescript
const state = entityStore.inspect('todos', 'abc-123');
// { base: { completed: false, ... }, layers: Map { 'm_1_k7x' => { completed: true } }, visible: { completed: true, ... } }
```

---

## Cache Lifetime

Entities persist for the SPA session. No eager eviction on component unmount.

**Ref counting + lazy eviction:**
- **Ref count per entity** — incremented when a query starts consuming an entity, decremented when the query disposes
- **Orphan timestamp** — when ref count drops to 0, record `Date.now()`. Entity stays in cache.
- **No immediate eviction** — orphaned entities remain for back-navigation (list → detail → back serves instantly from cache)
- **Pressure-based eviction** — when EntityStore exceeds a configurable threshold (e.g., 5000 entities), evict orphaned entities oldest-first (lowest orphan timestamp)
- **Safety rules:** never evict referenced entities (ref count > 0), never evict entities with pending optimistic layers

This mirrors how `query()` already works: `dispose()` stops the reactive effect but preserves the shared cache (`query.ts:519-536`).

---

## Manifesto Alignment

**Explicit over implicit:** The `OptimisticHandler` interface is explicit — it's a callback contract between packages. Entity metadata on descriptors is explicit (not inferred from URL patterns). The opt-out mechanism (`{ optimistic: false }`) is explicit.

**One way to do things:** Today there are two patterns: manual optimistic (local state + rollback) and no optimistic (await + refetch). This design consolidates to one: the framework handles it. The local state pattern becomes unnecessary.

**Compile-time over runtime:** `MutationDescriptor<T>` carries the entity type through generics. `EntityQueryMeta` on descriptors is added at codegen time, not discovered at runtime. TypeScript enforces that `MutationDescriptor` is not passed to `query()`.

**LLM-first:** An LLM generating code writes `await api.todos.update(id, body)` — one line, no cache key management, no snapshot/rollback pattern to remember. The generated SDK handles everything.

## Non-Goals

- **Create mutation optimistic updates (Tier 3)** — Deferred. Adding new items to cached lists requires evaluating filters, sorting, and pagination client-side. Separate design.
- **Custom (non-entity) mutation optimistic updates** — This design covers entity SDK methods only. A general `mutation()` primitive for custom endpoints is a separate concern.
- **Offline support / mutation queuing** — Optimistic updates here assume online connectivity. Offline-first patterns (queue mutations, sync on reconnect) are a separate feature.
- **Conflict resolution (409s)** — Server-side optimistic locking (etag/version) is covered by `entity-driven-architecture.md`. This design handles the UI-side optimistic pattern only.
- **Query invalidation after mutations** — This design makes invalidation unnecessary for the mutated entity (EntityStore propagates automatically). Invalidating *other* entities affected by a mutation (e.g., updating a task invalidates a project's task count) is a separate concern.

## Unknowns

### 1. TypeScript inference through MutationDescriptor (needs POC)

**Question:** When `await api.todos.update(id, body)` is called, does TypeScript correctly infer the Result type through `MutationDescriptor<T, E>.then()`? The `PromiseLike` interface with generic `then()` has known inference edge cases.

**Strategy:** Needs POC. Build minimal `MutationDescriptor` with `then()` and verify `await` resolves to `Result<T, E>`.

### 2. Computed data signal performance for large lists (needs POC)

**Question:** For a list query with 1000+ items, the `data` computed reads 1000 entity signals from EntityStore. Does this cause performance issues? Each signal read is O(1), but 1000 reads per recomputation may be significant.

**Strategy:** Needs POC. Benchmark a computed that reads 1000 signals vs a plain signal write.

### 3. Source switcher + SSR hydration interaction (discussion-resolvable)

**Question:** During SSR hydration, `hydrateQueryFromSSR()` writes to the data signal. With the source switcher, it writes to `rawData`. But `entityBacked` is false at hydration time. When does `entityBacked` flip? After the first effect-driven fetch? What about hydrated data — does it populate EntityStore?

**Strategy:** Discussion-resolvable. The SSR hydration callback should both write to `rawData` (for immediate display) AND populate EntityStore (for entity-backed reads). The `entityBacked` flag flips when EntityStore has the entity.

### 4. createDescriptor signature change backward compatibility (discussion-resolvable)

**Question:** Adding an optional `EntityQueryMeta` parameter to `createDescriptor()` changes its signature. Existing callers (manual `createDescriptor` calls outside codegen) would not break (new param is optional), but this is a public API change.

**Strategy:** Discussion-resolvable. The parameter is optional and additive. Non-breaking.

## Type Flow Map

```
Codegen (EntitySdkGenerator)
  │
  ├── EntityQueryMeta { entityType, kind, id }
  │     → createDescriptor() _entity param
  │     → QueryDescriptor<T>._entity
  │     → query() detects entity query
  │     → EntityStore.merge(entityType, T)
  │     → data computed reads EntityStore.get<T>(entityType, id)
  │     → QueryResult<T>.data auto-updates on EntityStore changes
  │
  ├── MutationMeta { entityType, kind, id, body }
  │     → createMutationDescriptor() mutation param
  │     → MutationDescriptor<T>._mutation
  │     → then() → OptimisticHandler.apply(MutationMeta, mutationId)
  │     → EntityStore.applyLayer(entityType, id, mutationId, body)
  │     → Entity signal recomputes (base + layers)
  │     → All entity-backed query data computeds update
  │     → On success: OptimisticHandler.commit() → commitLayer()
  │     → On error: rollback() → rollbackLayer()
  │
  └── OptimisticHandler (interface in @vertz/fetch)
        → Implemented by createOptimisticHandler() in @vertz/ui
        → Uses EntityStore layer stack internally
        → Injected into SDK factories via generated createClient
```

Each type flow path becomes a `.test-d.ts` acceptance criterion during implementation.

## E2E Acceptance Test

```typescript
// packages/integration-tests/src/automatic-optimistic-updates.test.ts

import { EntityStore } from '@vertz/ui';
import { createMutationDescriptor, createDescriptor } from '@vertz/fetch';
import type { MutationDescriptor, QueryDescriptor, OptimisticHandler } from '@vertz/fetch';

describe('Automatic Optimistic Updates', () => {
  // Phase 1: Layer stack
  describe('EntityStore layer stack', () => {
    it('applies optimistic layer and updates visible state', () => {
      const store = new EntityStore();
      store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

      store.applyLayer('todos', '1', 'm1', { completed: true });

      const entity = store.get('todos', '1');
      expect(entity.peek()).toEqual({ id: '1', completed: true, title: 'Buy milk' });
    });

    it('handles concurrent mutations independently', () => {
      const store = new EntityStore();
      store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

      store.applyLayer('todos', '1', 'm1', { completed: true });
      store.applyLayer('todos', '1', 'm2', { title: 'Buy eggs' });

      // Both layers applied
      expect(store.get('todos', '1').peek()).toEqual({
        id: '1', completed: true, title: 'Buy eggs',
      });

      // Rollback m1 — m2 survives
      store.rollbackLayer('todos', '1', 'm1');
      expect(store.get('todos', '1').peek()).toEqual({
        id: '1', completed: false, title: 'Buy eggs',
      });

      // Commit m2 with server data
      store.commitLayer('todos', '1', 'm2', {
        id: '1', completed: false, title: 'Buy eggs', updatedAt: '2026-03-03',
      });
      expect(store.get('todos', '1').peek()).toEqual({
        id: '1', completed: false, title: 'Buy eggs', updatedAt: '2026-03-03',
      });
    });

    it('rollback of delete restores entity and index positions', () => {
      const store = new EntityStore();
      store.merge('todos', [
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
        { id: '3', title: 'C' },
      ]);
      store._queryIndices.set('GET:/todos', ['1', '2', '3']);

      // Optimistic delete
      const snapshot = store.get('todos', '2').peek();
      const indexSnapshot = store._queryIndices.snapshotEntity('2');
      store.removeOptimistic('todos', '2', 'm1');

      expect(store._queryIndices.get('GET:/todos')).toEqual(['1', '3']);

      // Rollback
      store.restoreOptimistic('todos', '2', 'm1', snapshot, indexSnapshot);
      expect(store._queryIndices.get('GET:/todos')).toEqual(['1', '2', '3']);
      expect(store.get('todos', '2').peek()).toEqual({ id: '2', title: 'B' });
    });
  });

  // Phase 2: MutationDescriptor
  describe('MutationDescriptor', () => {
    it('calls OptimisticHandler.apply before fetch and commit on success', async () => {
      const calls: string[] = [];
      const handler: OptimisticHandler = {
        apply(meta, id) {
          calls.push(`apply:${meta.kind}:${id}`);
          return () => calls.push(`rollback:${id}`);
        },
        commit(meta, id) { calls.push(`commit:${meta.kind}:${id}`); },
      };

      const descriptor = createMutationDescriptor(
        'PATCH', '/todos/1',
        async () => ({ ok: true, data: { data: { id: '1', completed: true } } } as any),
        { entityType: 'todos', kind: 'update', id: '1', body: { completed: true } },
        handler,
      );

      await descriptor;
      expect(calls[0]).toMatch(/^apply:update:m_/);
      expect(calls[1]).toMatch(/^commit:update:m_/);
    });

    it('calls rollback on fetch failure', async () => {
      const calls: string[] = [];
      const handler: OptimisticHandler = {
        apply(meta, id) {
          calls.push(`apply:${id}`);
          return () => calls.push(`rollback:${id}`);
        },
        commit() {},
      };

      const descriptor = createMutationDescriptor(
        'PATCH', '/todos/1',
        async () => ({ ok: false, error: { message: 'Server error' } } as any),
        { entityType: 'todos', kind: 'update', id: '1', body: { completed: true } },
        handler,
      );

      const result = await descriptor;
      expect(result.ok).toBe(false);
      expect(calls[0]).toMatch(/^apply:m_/);
      expect(calls[1]).toMatch(/^rollback:m_/);
    });
  });

  // Phase 4: End-to-end
  describe('auto-optimistic SDK methods (end-to-end)', () => {
    it('update mutation optimistically updates query data and rolls back on error', async () => {
      // Setup: entity in store, query backed by store
      // Action: api.todos.update(id, { completed: true })
      // Assert: query.data.completed === true before server responds
      // Server fails → query.data.completed reverts to false
    });

    it('delete mutation removes entity from list query and restores on error', async () => {
      // Setup: list query with 3 items
      // Action: api.todos.delete('2')
      // Assert: list query shows 2 items immediately
      // Server fails → list query shows 3 items again, in original order
    });

    it('opt-out skips optimistic update', async () => {
      // Action: api.todos.update(id, body, { optimistic: false })
      // Assert: query.data unchanged until server responds
    });
  });
});

// Type-level tests
// @ts-expect-error — MutationDescriptor should not be passed to query()
query(api.todos.update('1', { completed: true }));

// QueryDescriptor._entity is optional
const desc: QueryDescriptor<Todo> = api.todos.get('1');
const entityMeta = desc._entity; // EntityQueryMeta | undefined
```
