# Entity Store & Client Reactivity Model

> **Status:** Draft — Design Discussion
> **Authors:** Vinicius (CTO), Mika (VP Eng)
> **Date:** 2026-02-20
> **Related:** `entity-driven-architecture.md`, `ui-design.md`, `result-boundaries.md`
> **Supersedes:** `ui-design.md` Non-Goal "Entity-level caching" — this design reverses that decision with justification.

---

## 1. Why Now (Reversing the Non-Goal)

The original `ui-design.md` listed entity-level caching as a **Non-Goal for v1**, citing complexity:

> "Entity-level caching (like Relay/Apollo normalized cache): query() uses query-level caching keyed by operation + parameters. Normalized entity caches add significant complexity. Deferred to a future version if needed."

**What changed:** Entity-Driven Architecture. When we designed `query()`, entities didn't exist as a first-class framework concept. Now they do. The framework knows every entity's schema, identity field, relations, and field types at compile time. This eliminates the entire class of problems that made Apollo's normalized cache painful:

| Apollo's Problem | Why We Don't Have It |
|---|---|
| Runtime `__typename` guessing | Compiler knows entity types statically |
| Manual `cache.modify()` after mutations | SDK mutations auto-update the store |
| Cache key collisions | Compiler generates deterministic keys per entity type + ID |
| Stale partial objects | Schema-aware merge: newer data wins, field-by-field |
| `fetchPolicy` confusion | One model: store-first, background revalidate |

**The key insight from the CTO:** When you load a list of users (name, avatar) and then open a user detail (name, avatar, email, bio), both views reference the same entity. The detail response should **enrich** the list's cached user — not create a separate cache entry. And when that user is updated (optimistic, real-time, or refetch), every view showing that user updates automatically.

This is only possible with a normalized store. Query-level caching can't do it — each query holds its own copy, and they diverge silently.

---

## 2. Core Principles

1. **Entities are stored by type + ID.** `{ User: { 42: {...}, 57: {...} }, Post: { 1: {...} } }`. Never by query key.

2. **Composition over replacement.** Fetching more fields for an entity *merges* into the existing cache entry. Fields are never lost — only enriched or updated. Newer data wins per-field.

3. **Compiler-enforced identity.** The compiler guarantees that every entity query includes the ID field. You cannot fetch an entity without its identity. This is not a convention — it's a compile error.

4. **Reactive by default.** When entity 42 changes in the store, every component that reads entity 42 re-renders. No manual subscription. The existing signal/effect system powers this.

5. **SSR hydration = store hydration.** The server serializes the normalized store into HTML. The client hydrates the store, not individual query results. Every `query()` that references cached entities gets instant hits.

6. **One update path.** Fetch, optimistic update, real-time push, and SSR hydration all go through the same store. One mental model.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Components                           │
│                                                         │
│   query(() => sdk.users.list())                         │
│   query(() => sdk.users.get(42))                        │
│   query(() => sdk.posts.list({ where: { authorId: 42 }}))│
│         │              │              │                  │
│         ▼              ▼              ▼                  │
│   ┌─────────────────────────────────────────────────┐   │
│   │              Query Layer (query())               │   │
│   │   Manages fetch lifecycle, dedup, revalidation   │   │
│   │   Delegates storage to EntityStore               │   │
│   └─────────────────────┬───────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│   ┌─────────────────────────────────────────────────┐   │
│   │              EntityStore (normalized)             │   │
│   │                                                  │   │
│   │   User:  { 42: signal({id,name,avatar,email})  } │   │
│   │   Post:  { 1: signal({id,title,authorId:42})   } │   │
│   │                                                  │   │
│   │   Relations resolved via IDs, not nested copies  │   │
│   │   Each entity is a signal → fine-grained updates │   │
│   └─────────────────────────────────────────────────┘   │
│                         ▲                               │
│                         │                               │
│         ┌───────────────┼───────────────┐               │
│         │               │               │               │
│     fetch()      optimistic()     realtime()            │
│     (network)    (local write)    (WS/SSE push)         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.1 The Store

```typescript
// Conceptual — actual API may differ
interface EntityStore {
  // Read a single entity by type + ID
  get<T extends EntityType>(type: T, id: string): Signal<EntityData<T> | undefined>;

  // Read multiple entities (for list queries)
  getMany<T extends EntityType>(type: T, ids: string[]): Signal<EntityData<T>[]>;

  // Merge data into the store (normalize + update signals)
  merge<T extends EntityType>(type: T, data: EntityData<T> | EntityData<T>[]): void;

  // Remove an entity (after delete)
  remove<T extends EntityType>(type: T, id: string): void;

  // Subscribe to all changes for a type (for list invalidation)
  onTypeChange<T extends EntityType>(type: T, callback: () => void): () => void;

  // Serialize the entire store (for SSR)
  dehydrate(): SerializedStore;

  // Hydrate from serialized data (client boot)
  hydrate(data: SerializedStore): void;
}
```

Each entity in the store is wrapped in a **signal**. When `merge()` updates entity 42, only components that read entity 42's signal re-render. This gives us fine-grained reactivity at the entity level, not the query level.

### 3.2 Normalization

Normalization is the process of converting a nested API response into flat entity entries.

```typescript
// API response for GET /api/posts?include=author
{
  data: [
    {
      id: "1",
      title: "Hello World",
      author: { id: "42", name: "Alice", avatar: "/alice.jpg" }
    }
  ]
}

// After normalization:
// Post store:  { "1": { id: "1", title: "Hello World", authorId: "42" } }
// User store:  { "42": { id: "42", name: "Alice", avatar: "/alice.jpg" } }
//
// The nested `author` is replaced with `authorId` reference.
// The User entity is stored separately and can be enriched by other queries.
```

**The compiler generates normalization functions per entity.** No runtime type guessing. The compiler knows:
- Which fields are relations (from entity definitions)
- What the target entity type is for each relation
- The ID field of each entity type
- Which fields should be stored vs which are computed/virtual

```typescript
// Generated by compiler — example, not public API
function normalizePost(raw: RawPost): NormalizeResult {
  const entities: NormalizeResult = { Post: {}, User: {} };
  
  entities.Post[raw.id] = {
    id: raw.id,
    title: raw.title,
    authorId: raw.author?.id ?? raw.authorId,
  };
  
  if (raw.author) {
    entities.User[raw.author.id] = raw.author;
  }
  
  return entities;
}
```

### 3.3 Denormalization

When a component reads data, the store denormalizes — resolving ID references back to entity signals.

```typescript
// Component reads a post with its author
const post = store.get('Post', '1');
// post.value = { id: "1", title: "Hello World", authorId: "42" }

// To get the related author:
const author = store.get('User', post.value.authorId);
// author.value = { id: "42", name: "Alice", avatar: "/alice.jpg" }
```

**The SDK handles this transparently.** When you query posts with `include: { author: true }`, the SDK returns a reactive object where `post.author` is a computed signal that reads from the User store. You never call `store.get()` directly.

### 3.4 Merge Strategy

When new data arrives for an entity that already exists in the store, the merge is **field-level, latest-wins:**

```typescript
// Existing in store (from list query):
User["42"] = { id: "42", name: "Alice", avatar: "/alice.jpg" }

// New data arrives (from detail query):
User["42"] = { id: "42", name: "Alice", avatar: "/alice.jpg", email: "alice@test.com", bio: "Engineer" }

// After merge:
User["42"] = { id: "42", name: "Alice", avatar: "/alice.jpg", email: "alice@test.com", bio: "Engineer" }
// ✅ Fields enriched. Nothing lost. The list view now has access to email/bio if it needs them.
```

**Field-level diffing:** The merge only triggers signal updates if a field value actually changed. If a refetch returns the same data, no re-render fires.

**Conflict resolution:**
- Newer fetch wins (timestamp-based, not sequence-based — handles out-of-order responses)
- Optimistic writes are tagged — if the server response differs, server wins and optimistic data is rolled back
- `.readOnly()` and `.hidden()` fields from schema annotations inform merge behavior — hidden fields never appear in client store

---

## 4. Integration with query()

The existing `query()` API remains the public interface. The Entity Store is an implementation detail that `query()` delegates to when the query target is an entity.

### 4.1 Entity-Aware Queries (Generated SDK)

```typescript
// Generated SDK — developer writes this:
const users = query(() => sdk.users.list());
// users.data → Signal<User[]>

const user = query(() => sdk.users.get(42));
// user.data → Signal<User>

// Both queries write to the same User store.
// If you load the list first, then load user 42's detail,
// the list's entry for user 42 is enriched with the detail fields.
```

**Under the hood:**

1. `sdk.users.list()` fetches from the API
2. Response is normalized by the compiler-generated `normalizeUser()` function
3. Each user entity is merged into the EntityStore
4. `query()` returns a reactive view backed by store signals
5. When entity 42 changes anywhere, both the list item and the detail view update

### 4.2 Non-Entity Queries

Not every `query()` targets an entity. External APIs, aggregations, and custom endpoints still use query-level caching as they do today:

```typescript
// This hits an external API — no entity normalization
const weather = query(() => fetch('/api/weather').then(r => r.json()));
// Uses the existing MemoryCache (query-key based), unchanged.
```

The router is simple: if the query uses the generated SDK (which the compiler can detect), it goes through the EntityStore. Otherwise, it falls back to the existing `MemoryCache`.

### 4.3 Compiler Detection

The compiler statically detects which queries are entity-aware:

```typescript
// Entity query — compiler sees sdk.users.list() → routes to EntityStore
const users = query(() => sdk.users.list());

// Generic query — compiler sees raw fetch() → routes to MemoryCache
const data = query(() => fetch('/external-api').then(r => r.json()));
```

This means **zero API changes for the developer.** `query()` looks the same either way. The compiler decides the backing store.

---

## 5. The Four Update Patterns

All four patterns write through the same EntityStore. One mental model.

### 5.1 Fetch (Network)

Standard flow. Response normalizes into store. All reactive views update.

```typescript
const users = query(() => sdk.users.list());
// Fetch → normalize → store.merge(User, [...]) → signal updates → UI re-renders
```

### 5.2 Optimistic Update

Write to store immediately. Tag as optimistic. Confirm or rollback on server response.

```typescript
// User clicks "Complete Task"
const result = sdk.tasks.update(taskId, { completed: true }, { optimistic: true });

// Immediately:
// store.merge('Task', { id: taskId, completed: true }, { optimistic: true })
// → Every component showing this task sees completed: true NOW

// When server responds:
// Success → optimistic tag removed, data stays
// Error   → optimistic data rolled back, error surfaced via query().error
```

**Implementation detail:** Optimistic writes store a "shadow" of the previous value. On rollback, the shadow is restored. This is per-entity, not per-query — so a rollback correctly reverts all views that were showing the optimistic data.

### 5.3 Real-Time (WebSocket/SSE)

Server pushes entity patches. Same merge path.

```typescript
// Server sends: { type: "entity.updated", entity: "User", id: "42", data: { name: "Alice B." } }

// Client handler:
store.merge('User', { id: '42', name: 'Alice B.' });
// → Every component showing user 42 updates. List views, detail views, anywhere.
```

**No special API.** The real-time handler just calls `store.merge()`. The reactivity system handles the rest. This is why a single normalized store matters — the real-time handler doesn't need to know which queries or components care about user 42. The signal graph resolves it.

### 5.4 SSR Hydration

Server serializes the normalized store. Client hydrates it. No duplicate fetches.

```typescript
// Server (during renderPage/renderToStream):
const serialized = entityStore.dehydrate();
// Injected into HTML: <script>window.__VERTZ_STORE__ = ${JSON.stringify(serialized)}</script>

// Client (on boot):
entityStore.hydrate(window.__VERTZ_STORE__);
// All entity signals are now populated.
// query() calls that reference these entities get immediate cache hits.
// No loading spinners. No waterfalls. Instant render.
```

**Streaming SSR integration:** For streaming responses, store data is serialized in chunks alongside the HTML chunks. As each `<StreamBoundary>` resolves, its entity data is flushed to the store serialization buffer. The client processes store chunks as they arrive.

---

## 6. Compiler's Role

The compiler is what makes this work without Apollo's pain points. It has compile-time knowledge that no runtime solution can match.

### 6.1 ID Field Enforcement

```typescript
// Entity definition:
const task = entity('task', {
  schema: taskSchema,  // has id field
  // ...
});

// If a developer tries to query without selecting the ID:
query(() => sdk.tasks.list({ select: { title: true } }));
//                                    ^^^^^^^^^^^^^^^^
// Compiler error: "Entity queries must include the identity field 'id'.
//                  Add '{ id: true }' to your select, or remove select
//                  to fetch all fields."
```

**This is the foundation.** Without guaranteed IDs, normalization is impossible. The compiler makes this a hard invariant, not a runtime prayer.

### 6.2 Generated Normalize/Denormalize Functions

Per entity type, the compiler generates:

- `normalize[Entity](response)` — flattens nested relations into store entries
- `denormalize[Entity](storeEntry, store)` — resolves ID references back to reactive signals
- `merge[Entity](existing, incoming)` — field-level merge with diff detection

These are **static, tree-shakeable functions**. No runtime reflection. No `__typename` parsing. The bundle only includes normalizers for entities the app actually uses.

### 6.3 Relation Resolution

The compiler knows the full relation graph:

```typescript
// Entity definitions:
const post = entity('post', {
  model: d.model('posts', {
    relations: {
      author: d.ref.one('users'),
      comments: d.ref.many('comments'),
    }
  }),
  relations: { author: true, comments: true },
});
```

From this, the compiler generates:
- `normalizePost` knows to extract `author` as a User entity and `comments` as Comment entities
- `denormalizePost` knows to resolve `authorId → store.get('User', authorId)` as a computed signal
- Circular references (user → posts → author → ...) are handled by ID indirection — no actual cycles in the store

### 6.4 Dead Field Detection

```typescript
// Component only reads title and author name:
function PostCard(props) {
  return <div>{props.post.title} by {props.post.author.name}</div>;
}

// But the query fetches everything:
query(() => sdk.posts.list({ include: { author: true } }));

// Compiler warning: "PostCard reads only 'title' and 'author.name' from Post.
//                    Consider narrowing your select: { title: true, author: { select: { name: true } } }"
```

This is a **suggestion, not an error.** Over-fetching populates the store with data that other components might use (the composition benefit). But the compiler surfaces the optimization opportunity.

---

## 7. List Queries & Collection Tracking

Entity normalization handles individual entities well. List queries need additional tracking to know which entities belong to which query result.

### 7.1 Query Result Index

Each list query maintains a **result index** — an ordered list of entity IDs that the query returned:

```typescript
// query(() => sdk.users.list({ where: { role: 'admin' } }))
// After fetch, the query layer stores:
// queryIndex["users.list.role=admin"] = ["42", "57", "89"]

// The actual User data lives in the EntityStore.
// The query result is computed: ids.map(id => store.get('User', id))
```

This means:
- The list query result is always consistent with the store
- If user 42 is updated via a different query, the list view updates automatically (it reads from the same signal)
- New items from the server are easy: update the result index + merge entities

### 7.2 List Invalidation

When should a list query re-fetch?

- **Entity in list updated:** No re-fetch needed. The store signal updates the view directly.
- **Entity created:** The list's result index is stale — it doesn't include the new entity. Trigger revalidation.
- **Entity deleted:** Remove from result index + store. No re-fetch needed.
- **Filter/sort changed:** New query, new result index, new fetch.

**Create invalidation** is the tricky case. When `sdk.users.create()` succeeds, the SDK knows which entity type was created. It broadcasts a `type-changed` event for `User`. All list queries watching `User` revalidate.

This is coarse-grained (any create invalidates all `User` lists) but correct and simple. Fine-grained list invalidation (only invalidate lists whose filters match the new entity) is a v0.2 optimization.

### 7.3 Pagination & Cursor Tracking

Paginated lists maintain cursors per query:

```typescript
// First page:
query(() => sdk.users.list({ limit: 20 }));
// queryIndex["users.list"] = { ids: [...20 ids], nextCursor: "abc123" }

// Load more:
query(() => sdk.users.list({ limit: 20, cursor: "abc123" }));
// queryIndex["users.list"] = { ids: [...40 ids], nextCursor: "def456" }
// The 20 new entities are merged into store. IDs appended to result index.
```

---

## 8. SSR Data Bridge

The SSR data bridge is the mechanism that transfers server-side entity data to the client without duplicate fetches.

### 8.1 Server-Side Collection

During `renderPage()` or `renderToStream()`, the server executes `query()` calls. These go through the same EntityStore interface, but backed by a server-side implementation that:

1. Calls the entity handlers directly (no HTTP round-trip)
2. Normalizes responses into a server-side store
3. Returns data to the component for rendering

At the end of rendering, the server-side store is serialized.

### 8.2 Serialization

```html
<!-- Injected into the HTML stream -->
<script type="application/json" id="__VERTZ_STORE__">
{
  "entities": {
    "User": {
      "42": { "id": "42", "name": "Alice", "avatar": "/alice.jpg" },
      "57": { "id": "57", "name": "Bob", "avatar": "/bob.jpg" }
    },
    "Post": {
      "1": { "id": "1", "title": "Hello", "authorId": "42" }
    }
  },
  "queries": {
    "users.list": { "ids": ["42", "57"], "nextCursor": null },
    "posts.list.authorId=42": { "ids": ["1"], "nextCursor": null }
  }
}
</script>
```

**Why `application/json` and not inline JS?** CSP compatibility. No `eval`, no nonce required for the data payload. The hydration script (which does need a nonce) reads and parses this element.

### 8.3 Streaming SSR

For streaming responses, store data is emitted alongside HTML chunks:

```html
<!-- Initial shell -->
<div data-v-id="UserList" data-v-key="list">
  <!--v-pending:0-->
</div>

<!-- When the users query resolves: -->
<script type="application/json" data-v-store-chunk="0">
{"User":{"42":{"id":"42","name":"Alice"},"57":{"id":"57","name":"Bob"}}}
</script>
<template data-v-chunk="0">
  <div>Alice</div><div>Bob</div>
</template>
<script>/* swap pending marker with resolved content + hydrate store chunk */</script>
```

Each chunk includes its entity data. The client processes chunks as they arrive — the store builds up incrementally, and components hydrate with their data already cached.

### 8.4 Stale-While-Revalidate After Hydration

After hydration, the store is warm but potentially stale (the data was fetched at SSR time). The default behavior:

1. **Render immediately from hydrated store** (no loading state)
2. **Background revalidate** after mount (configurable delay, default 0 — immediate)
3. **If data hasn't changed** — no re-render (field-level diff)
4. **If data has changed** — store updates, components re-render seamlessly

```typescript
// Global config
app.config({
  entityStore: {
    revalidateOnHydration: true,    // default
    revalidateDelay: 0,             // ms after mount, default 0
  }
});

// Per-query override
query(() => sdk.users.get(42), { revalidateOnMount: false });
// Don't revalidate — trust the SSR data is fresh enough
```

---

## 9. Avoiding Apollo's Mistakes

Specific lessons from Apollo Client's normalized cache, and how we avoid each:

### 9.1 No Manual Cache Updates

**Apollo:** After a mutation, you write `cache.modify()` or `cache.evict()` to update related queries. Forget one, and your UI is stale.

**Vertz:** SDK mutations auto-update the store. `sdk.users.update(42, { name: 'Alice B.' })` returns the updated entity → normalized into store → all views update. For creates, a `type-changed` broadcast triggers list revalidation. For deletes, the entity is removed from store + all result indices. **Zero manual cache code.**

### 9.2 No `fetchPolicy` Confusion

**Apollo:** `cache-first`, `cache-and-network`, `network-only`, `cache-only`, `no-cache`, `standby`. Six policies. Developers never know which to use.

**Vertz:** One model. **Store-first, background revalidate.** If the data is in the store, render it. If it might be stale, revalidate in the background. If it's definitely stale (explicit refetch), show loading. That's it. The framework decides based on data age and the entity's configured stale time.

```typescript
// Per-entity stale time (in entity definition, server-side)
const user = entity('user', {
  // ...
  cache: { staleTime: 60_000 },  // consider stale after 60s
});

// This config flows to the client SDK via codegen.
// query() checks: is the cached entity older than staleTime?
//   Yes → render cached + background revalidate
//   No  → render cached, skip revalidate
```

### 9.3 No `__typename` Hacks

**Apollo:** Uses `__typename` + `id` as cache keys. If your response omits `__typename` (non-GraphQL APIs), the cache breaks. Workaround: custom `typePolicies`.

**Vertz:** Entity types are known at compile time. The normalizer is generated per entity. There is no runtime type discovery — the compiler already resolved it. This works for REST responses (which don't have `__typename`) because the SDK knows which entity type each endpoint returns.

### 9.4 No Cache Inconsistency

**Apollo:** If two queries return the same entity with different fields, and one is updated, the other might show stale data depending on `fetchPolicy` and merge function configuration.

**Vertz:** Single source of truth. Entity 42 exists once in the store. All queries read from the same signal. Field-level merge means any query that fetches new fields enriches the single entry. No divergence possible.

---

## 10. `query()` as Compiler-Recognized Primitive

### 10.1 The `let`/`const` Resolution

The vertz reactivity model: `let` = reactive (reassignment triggers updates), `const` = not reactive (snapshot or computed). But `query()` returns an object with reactive *properties* — the variable itself is never reassigned.

**Decision: `query()` is a compiler-recognized primitive.** Developers use `const` (semantically correct — no reassignment). The compiler recognizes `query()` and knows that `.data`, `.loading`, and `.error` on the result are signals that need unwrapping in JSX.

```typescript
// Developer writes:
const user = query(() => sdk.users.get(id));
return <div>{user.data.name}</div>;

// Compiler output:
const __user = query(() => sdk.users.get(id));
return <div>{__user.data.value.name}</div>;  // .value inserted automatically
```

**Why this works:**
- `const` is correct — the developer never reassigns the variable
- The `let`/`const` model stays clean: `let` = reassignment, `const` = stable reference
- `query()` joins the compiler's list of known framework functions (alongside `signal()`, `computed()`, `effect()`)
- The compiler already needs to recognize `query()` for field access tracing — this extends naturally
- Precedent: SolidJS (`createResource`), Svelte 5 (`$state`), and Qwik all have compiler-recognized data primitives

**What's reactive and what isn't:**
```typescript
const user = query(() => sdk.users.get(id));
user.data.name     // ✅ reactive — compiler unwraps .data signal, tracks .name access
user.loading       // ✅ reactive — compiler unwraps .loading signal
user.error         // ✅ reactive — compiler unwraps .error signal
user.refetch       // not reactive — it's a function, no unwrapping needed
```

---

## 11. Compiler-Inferred Field Selection (Zero-Effort Queries)

This is the crown jewel. The developer never writes a `select` clause. The compiler traces which entity fields the code actually reads and generates the optimal VertzQL query automatically.

### 11.1 The Problem With Manual Selects

Every existing framework requires the developer to specify what data they want:

```typescript
// Apollo/GraphQL — developer writes the fragment
const USER_FRAGMENT = gql`fragment UserCard on User { id name avatar }`;

// TanStack Query — developer writes the fetch + types
const { data } = useQuery({ queryKey: ['user', 42], queryFn: () => fetchUser(42) });

// Relay — developer writes the fragment
const data = useFragment(graphql`fragment UserCard_user on User { id name avatar }`, userRef);
```

In every case, the developer **duplicates intent.** The component reads `user.name` and `user.avatar` — but the developer must separately declare those same fields in a query/fragment. When the component changes (add `user.email`), the query must also change. Forget to update it → runtime error or missing data.

### 11.2 Vertz's Approach: Use It, We'll Fetch It

```typescript
// Developer writes ONLY this:
function UserCard(props: { userId: string }) {
  const user = query(() => sdk.users.get(props.userId));
  
  return (
    <div class="card">
      <img src={user.data.avatar} />
      <h3>{user.data.name}</h3>
    </div>
  );
}
```

The developer accesses `user.data.avatar` and `user.data.name` in JSX. That's all the compiler needs.

**What the compiler does:**

1. **Traces property access paths** on entity query results within the component:
   - `user.data.avatar` → field path: `['avatar']`
   - `user.data.name` → field path: `['name']`
   
2. **Collects access paths per query** across the component (including conditionals, loops, helper functions called within the component):
   - Query `sdk.users.get(props.userId)` → accessed fields: `{ id: true, avatar: true, name: true }`
   - `id` is always included (compiler-enforced identity)

3. **Generates the VertzQL select clause** at compile time:
   ```typescript
   // Compiled output (what actually runs):
   query(() => sdk.users.get(props.userId, { select: { id: true, avatar: true, name: true } }));
   ```

4. **When the component changes**, the compiler re-traces and updates the query automatically. Add `<p>{user.data.email}</p>` → the select adds `email: true`. No manual sync.

### 11.3 Relation Traversal

The same tracing works across relations:

```typescript
function PostCard(props: { postId: string }) {
  const post = query(() => sdk.posts.get(props.postId));
  
  return (
    <article>
      <h2>{post.data.title}</h2>
      <span>by {post.data.author.name}</span>
      <time>{post.data.createdAt}</time>
    </article>
  );
}

// Compiler traces:
// - post.data.title        → Post.title
// - post.data.author.name  → Post.author (relation) → User.name
// - post.data.createdAt    → Post.createdAt
//
// Generated VertzQL:
// sdk.posts.get(props.postId, {
//   select: { id: true, title: true, createdAt: true },
//   include: { author: { select: { id: true, name: true } } }
// })
```

The compiler knows `author` is a relation (from the entity definition) and generates an `include` with a nested `select`. The developer just wrote `post.data.author.name` — the framework figured out the rest.

### 11.4 Dynamic Access Patterns

Not all access is static. The compiler handles several levels:

**Static access (compile-time resolvable):**
```typescript
// Direct property access in JSX — fully traceable
<div>{user.data.name}</div>
// → select: { name: true }
```

**Conditional access:**
```typescript
// Both branches are traced — union of all accessed fields
if (showEmail) {
  return <div>{user.data.name} ({user.data.email})</div>;
} else {
  return <div>{user.data.name}</div>;
}
// → select: { name: true, email: true }  (union of both branches)
```

**Loop access:**
```typescript
// Array iteration — element property access is traced
{post.data.comments.map(c => <div>{c.text} by {c.author.name}</div>)}
// → include: { comments: { select: { id: true, text: true }, include: { author: { select: { id: true, name: true } } } } }
```

**Dynamic property access (opaque to compiler):**
```typescript
// The compiler can't trace this — falls back to selecting all fields
const field = someCondition ? 'name' : 'email';
return <div>{user.data[field]}</div>;
// → select: all public fields (safe fallback)
```

**The fallback is always safe.** If the compiler can't determine which fields are accessed, it fetches all public fields (respecting the narrowing hierarchy). Over-fetching is a performance concern, not a correctness concern — and the compiler emits a warning:

```
warning[opaque-field-access]: Dynamic property access on entity 'User' at line 12.
  Cannot infer field selection — all public fields will be fetched.
  Consider using static property access for optimal query generation.
```

### 11.5 Cross-Component Tracing

When entity data flows between components, the compiler traces across boundaries:

```typescript
function PostList() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data.map(p => <PostCard post={p} />)}</div>;
}

function PostCard(props: { post: Post }) {
  return (
    <article>
      <h2>{props.post.title}</h2>
      <span>{props.post.author.name}</span>
    </article>
  );
}

// Compiler traces PostCard's access to props.post:
// - props.post.title       → Post.title
// - props.post.author.name → Post.author → User.name
//
// Traces back to PostList's query, which is the data source.
// Generated query in PostList:
// sdk.posts.list({
//   select: { id: true, title: true },
//   include: { author: { select: { id: true, name: true } } }
// })
```

**How it works:** The compiler's taint analysis already tracks data flow through props. We extend it to track **property access paths** on tainted values. When a prop is typed as an entity, all property accesses on that prop contribute to the originating query's field selection.

### 11.6 Composition: Multiple Components, One Query

When the same entity is used in multiple components with different field needs, the query fetches the **union**:

```typescript
function UserPage(props: { userId: string }) {
  const user = query(() => sdk.users.get(props.userId));
  return (
    <div>
      <UserHeader user={user.data} />    {/* reads: name, avatar */}
      <UserProfile user={user.data} />   {/* reads: name, email, bio, joinedAt */}
    </div>
  );
}

// Union of all fields read by child components:
// sdk.users.get(props.userId, {
//   select: { id: true, name: true, avatar: true, email: true, bio: true, joinedAt: true }
// })
```

This is optimal — one network request, fetching exactly the union of what all consumers need. No under-fetching (missing fields), no wild over-fetching (selecting *).

### 11.7 Fine-Grained Reactivity via Computed Selectors

The entity store uses **signal-per-entity** (not signal-per-field). But the compiler generates **computed selectors** so components only re-render when their specific fields change:

```typescript
// Store holds:
// User["42"] = signal({ id: "42", name: "Alice", avatar: "/a.jpg", email: "alice@test.com" })

// For UserHeader (reads name, avatar), compiler generates:
const __userHeader_name = computed(() => store.get('User', '42').value.name);
const __userHeader_avatar = computed(() => store.get('User', '42').value.avatar);

// For UserProfile (reads name, email, bio, joinedAt), compiler generates:
const __userProfile_name = computed(() => store.get('User', '42').value.name);
const __userProfile_email = computed(() => store.get('User', '42').value.email);
// ... etc

// When a real-time push updates ONLY email:
// store.merge('User', { id: '42', email: 'newalice@test.com' })
//
// Entity signal fires → all computeds re-evaluate:
// - __userHeader_name:   "Alice" === "Alice"   → NO change → UserHeader does NOT re-render
// - __userHeader_avatar: "/a.jpg" === "/a.jpg" → NO change → UserHeader does NOT re-render
// - __userProfile_email: old !== new           → CHANGED   → UserProfile re-renders
```

**This gives us signal-per-property semantics without the implementation complexity.** The store is simple (one signal per entity). The compiler generates the fine-grained layer. Best of both worlds.

### 11.8 Relationship to Existing Taint Analysis

The ui-design.md describes a two-pass taint analysis for reactivity:

1. **Pass 1 (Identify):** Find all `let` declarations → mark as reactive
2. **Pass 2 (Transform):** Transform reads/writes into signal operations

**Entity field tracing extends Pass 1** with a third concern:

3. **Pass 1b (Field Access):** For variables tainted as entity data (from `query()` results or entity-typed props), trace all property access paths. Build a field access map per query source.

This reuses the existing taint propagation infrastructure. The compiler already tracks which variables flow from which sources. We add property access path tracking to tainted entity variables — same dataflow graph, richer annotations.

**Edge cases handled the same way as reactivity taint:**
- Closures capturing entity data → tracked through closure scope
- HOCs wrapping components → tracked through prop forwarding
- Conditional rendering → union of all branch accesses
- Dynamic components → safe fallback (all fields)

### 11.9 Developer Escape Hatch

If the developer wants explicit control (rare, but possible):

```typescript
// Explicit select overrides compiler inference
const user = query(() => sdk.users.get(42), {
  select: { id: true, name: true, email: true, avatar: true }
});

// Compiler sees explicit select → skips inference, uses developer's selection
```

This is the "one way to do things" exception: the framework infers by default, but explicit overrides are respected. The compiler emits no warnings when an explicit select is provided.

---

## 12. Updating `ui-design.md` Non-Goals

The original `ui-design.md` lists entity-level caching as a non-goal. This design reverses that decision. The non-goal entry should be updated to:

> ~~**Entity-level caching** (like Relay/Apollo normalized cache): `query()` uses query-level caching keyed by operation + parameters. Normalized entity caches add significant complexity. Deferred to a future version if needed.~~
>
> **Entity-level caching:** Now a core feature. See `entity-store-design.md`. The Entity Store provides normalized caching with compiler-generated normalization — avoiding the complexity that made Apollo's cache painful. This was made possible by Entity-Driven Architecture giving the compiler full knowledge of entity schemas at build time.

---

## 13. Shipping Plan

### v0.1 — Core Store + Compiler Inference (ships with EDA v0.1)

- [ ] `EntityStore` with `get`, `getMany`, `merge`, `remove`
- [ ] Signal-based entity storage (fine-grained reactivity)
- [ ] Compiler: ID field enforcement in entity queries
- [ ] Compiler: `normalize` / `merge` function generation per entity
- [ ] Compiler: **field access tracing** — trace property access paths on entity data in components
- [ ] Compiler: **auto-generated VertzQL select** — infer `select` + `include` from traced field access
- [ ] Compiler: **computed selector generation** — field-specific computeds with equality checks for fine-grained reactivity
- [ ] Compiler: **cross-component tracing** — follow entity data through props to aggregate field access at query source
- [ ] Compiler: **safe fallback** — dynamic/opaque property access selects all public fields + emits warning
- [ ] `query()` integration: entity-aware queries route to EntityStore
- [ ] `query()` fallback: non-entity queries use existing `MemoryCache`
- [ ] SSR hydration: `dehydrate()` / `hydrate()` for the store
- [ ] SDK mutations auto-update store (update, delete)
- [ ] List query result indices with type-changed invalidation on create
- [ ] Serialization format: `<script type="application/json">` for CSP
- [ ] Developer escape hatch: explicit `select` option overrides compiler inference

### v0.2 — Production Hardening

- [ ] Optimistic updates with shadow/rollback
- [ ] Real-time integration (WebSocket/SSE → `store.merge()`)
- [ ] Streaming SSR with chunked store data
- [ ] Stale time configuration per entity
- [ ] Background revalidation with configurable delay
- [ ] Fine-grained list invalidation (filter-aware)
- [ ] Computed/virtual fields in store
- [ ] Denormalization with relation resolution (computed signals)
- [ ] Garbage collection: evict entities not referenced by any active query
- [ ] Conditional branch analysis optimization (trace only reachable branches when condition is compile-time known)

### v0.3+ — Advanced

- [ ] Pagination cursor tracking and infinite scroll support
- [ ] Cross-tab store sync (BroadcastChannel)
- [ ] Persistent store (IndexedDB) for offline-first
- [ ] Compiler: dead field detection warnings (fields fetched but never read)
- [ ] Compiler: select narrowing suggestions (over-fetching in explicit selects)
- [ ] Partial hydration: only serialize entities referenced by hydrated components
- [ ] Hot path optimization: frequently-accessed entities get dedicated signals per field

---

## 14. Relation to Existing Code

### What stays
- `query()` API — unchanged public interface
- `CacheStore` interface — still used for non-entity queries
- `MemoryCache` — still the default for non-entity queries
- Signal system (`signal`, `computed`, `effect`) — powers the entity signals
- Hydration markers (`data-v-id`, `data-v-key`) — unchanged

### What changes
- `query()` internals — detects entity SDK calls and routes to EntityStore
- SSR serialization — adds store dehydration alongside existing hydration markers
- Codegen — generates normalize/denormalize/merge functions per entity
- SDK — mutations go through store before returning to caller

### What's new
- `EntityStore` class — the normalized, signal-backed store
- Compiler passes — ID enforcement, normalizer generation, entity query detection
- SSR bridge — `dehydrate()`/`hydrate()` protocol
- Store chunk streaming for streaming SSR

---

## 15. Open Questions

1. ~~**Store scope:**~~ **RESOLVED.** Per-request on server (hard requirement — framework enforces, no opt-out). Singleton on client. See §15.1.

2. **Relation depth:** How deep should automatic denormalization go? `post.author` is one level. `post.author.posts.comments.author` is pathological. Recommendation: denormalize on access (lazy), not eagerly. Each `.` access reads a signal — the depth is driven by the component, not the store.

3. **Partial entity updates:** When a real-time push contains only `{ id: "42", name: "Alice B." }` (2 fields out of 10), should we merge (keep other fields) or replace? Recommendation: always merge. Explicit `store.replace()` for the rare case you need full replacement.

4. **Garbage collection strategy:** When should unused entities be evicted? Recommendation: reference counting via active query subscriptions. When no query references entity 42, start a GC timer. If no query re-references it within `gcTime` (default 5 min), evict.

5. **Conflict resolution for concurrent mutations:** Two tabs update the same entity simultaneously. The second response might overwrite the first's more recent data. Recommendation: use `updatedAt` timestamp from the entity schema (if available) as tie-breaker. Otherwise, last-write-wins.

6. **Polymorphic entities and composite keys:** Out of scope for v0.1. Document as known limitation.

---

## 15.1 SSR Store Isolation (Resolved — Hard Requirement)

> Prompted by Devil's Advocate review (Critical concern #2).

The framework **must** create a new EntityStore instance per SSR request. This is not a recommendation — it's enforced:

```typescript
// Inside renderPage / renderToStream (framework code, not developer code):
const store = new EntityStore();  // fresh per request
const ctx = createSSRContext({ store });
// All query() calls during this render use this store instance.
// After render, store.dehydrate() serializes only this request's data.
// Store is garbage collected after response is sent.
```

**Enforcement mechanism:** The SSR render function creates the store. There is no global store on the server. If a developer tries to import a shared store instance, the compiler emits an error:

```
error[ssr-shared-store]: EntityStore cannot be shared across SSR requests.
  Create the store inside renderPage() or renderToStream().
  Sharing stores between requests causes data leaks.
```

---

## 15.2 Debugging the Compiler (New — from DX Skeptic review)

When the compiler infers field selections, developers need visibility into what was inferred. Without it, debugging wrong/missing data is a black box.

### CLI: `vertz build --trace-fields`

Outputs inferred selects per query during build:

```
[field-trace] src/components/UserCard.tsx
  query(sdk.users.get) → select: { id, name, avatar }

[field-trace] src/components/PostFeed.tsx
  query(sdk.posts.list) → select: { id, title, createdAt }
                           include: { author: { select: { id, name } } }

[field-trace] src/components/Dashboard.tsx
  query(sdk.tasks.list) → select: * (opaque access at line 42)
                           ⚠ Dynamic property access: consider static access for optimal queries
```

### DevTools Panel

In development mode, a browser DevTools panel shows:
- Live store state (all entities, grouped by type)
- Per-query: inferred select, cache status, last fetch time
- Per-entity: which components are subscribed, last merge source

### Compiler Errors & Warnings (Exhaustive List)

| Code | Severity | Message |
|---|---|---|
| `missing-entity-id` | Error | Entity queries must include the identity field 'id'. |
| `ssr-shared-store` | Error | EntityStore cannot be shared across SSR requests. |
| `opaque-field-access` | Warning | Dynamic property access on entity — all public fields will be fetched. |
| `relation-not-exposed` | Error | Relation 'X' is not exposed on entity 'Y'. Check entity relations config. |
| `field-not-exposed` | Error | Field 'X' is hidden or not exposed on relation 'Y'. |

---

## 15.3 Testing Story (New — from DX Skeptic review)

### Unit Testing Components

```typescript
import { createTestStore } from '@vertz/ui/test';
import { render } from '@vertz/ui/test';

test('UserCard renders user name', () => {
  const store = createTestStore({
    User: {
      '42': { id: '42', name: 'Alice', avatar: '/alice.jpg' }
    }
  });

  const { findByText } = render(<UserCard userId="42" />, { store });
  expect(findByText('Alice')).toBeTruthy();
});
```

### Testing Mutations

```typescript
test('completing a task updates the store', async () => {
  const store = createTestStore({
    Task: { '1': { id: '1', title: 'Buy milk', completed: false } }
  });

  const { click, findByText } = render(<TaskItem taskId="1" />, { store });
  await click(findByText('Complete'));

  // Store is updated
  expect(store.get('Task', '1').value.completed).toBe(true);
});
```

### Testing SSR Hydration

```typescript
test('hydrated store prevents refetch', async () => {
  const store = createTestStore({
    User: { '42': { id: '42', name: 'Alice' } }
  });

  const fetchSpy = vi.fn();
  const { findByText } = render(<UserCard userId="42" />, { store, fetchSpy });

  expect(findByText('Alice')).toBeTruthy();
  expect(fetchSpy).not.toHaveBeenCalled(); // No fetch — data was in store
});
```

### Mock SDK

For integration tests that need full SDK behavior:

```typescript
import { createMockSDK } from '@vertz/testing';

const sdk = createMockSDK({
  users: {
    get: async (id) => ({ id, name: 'Alice', avatar: '/alice.jpg' }),
    list: async () => [{ id: '42', name: 'Alice' }],
  }
});

// sdk.users.get('42') returns mock data and writes to the test store
```

---

## 15.4 Reactivity Model: Entity Signal + Shallow Compare (Simplified)

> Prompted by Compiler Expert review (concern #4: computed selector overhead).

**v0.1 default: entity-level signal + shallow object compare.** Not computed selectors per field.

When entity 42 updates, the entity signal fires. Components that read from entity 42 re-render. The shallow compare catches the common case (most updates change only 1-2 fields, but the component reads those fields).

```typescript
// Default behavior (v0.1):
// Entity signal fires → component re-evaluates JSX → 
// if accessed fields haven't changed, DOM diff is a no-op
```

**v0.2 optimization: opt-in computed selectors** for high-frequency update scenarios (real-time dashboards, live cursors). The compiler can suggest this when it detects hot entities:

```
hint[hot-entity]: Entity 'CursorPosition' updates frequently (>10/s).
  Consider computed selectors for components reading only a subset of fields.
  Add { reactivity: 'fine' } to the query options.
```

This simplifies v0.1 significantly while keeping the optimization path open.

---

## 16. Why This Approach Wins

**For developers:** Write `query(() => sdk.users.list())`. Get automatic caching, deduplication, real-time updates, SSR hydration, and composition. Zero cache management code.

**For LLMs:** One pattern. `query()` + SDK. No `fetchPolicy` to choose, no `cache.modify()` to write, no `refetchQueries` to list. An LLM generates correct data-fetching code on the first prompt.

**For performance:** Normalized store means each entity is fetched once and shared across views. No duplicate data in memory. Fine-grained signals mean only affected components re-render. SSR hydration means zero client-side waterfalls on first load.

**For the framework:** The store is the single source of truth on the client. Real-time, optimistic updates, and SSR all converge on one data structure. This makes every future feature simpler — because there's only one place to put data and one way to read it.
