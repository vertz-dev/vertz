# SSR Data Bridge — Scope for State Serialization & Query Integration

**Author:** Mika (VP Engineering)  
**Date:** 2026-02-18  
**Status:** Scope (ready for implementation planning)  
**Goal:** Make SSR work end-to-end with data — server fetches, streams HTML, client picks up without refetching

---

## The Problem

Today's SSR renders UI but not data. `renderToStream` handles Suspense boundaries and streams HTML, but:

1. `query()` only runs on the client — there's no server-side execution
2. No mechanism to serialize fetched data from server → client
3. Client-side `query()` refetches everything, wasting the server's work

**Result:** First paint is fast (streaming HTML) but interactive paint is slow (client refetches all data).

---

## What Exists

### Server side (`@vertz/ui-server`)
- ✅ `renderToStream()` — walks VNode tree, detects `__suspense` VNodes, streams resolved content
- ✅ Slot placeholder system — `<div id="v-slot-N">fallback</div>` → `<template>` replacement
- ✅ `renderPage()` — full HTML document with head, meta, assets, streaming body

### Client side (`@vertz/ui`)
- ✅ `query(thunk, { initialData })` — accepts pre-populated data, skips initial fetch
- ✅ `MemoryCache` with `CacheStore` interface — pluggable
- ✅ `hydrate(registry)` — scans DOM for `data-v-id`, deserializes props, mounts components
- ✅ Cache key derivation from signal dependency values — deterministic

### The gap
- ❌ No server-side `query()` execution
- ❌ No data serialization (server → client)
- ❌ No cache hydration on client startup

---

## The Bridge — Three Pieces

### Piece 1: Server-side query execution

**What:** When `renderToStream` encounters a component that calls `query()`, the query executes on the server and its result feeds into the Suspense resolution.

**How it works:**

```
Component calls query(thunk) on server
  → thunk() executes, returns Promise<T>
  → Promise is thrown (Suspense catches it)
  → renderToStream already handles this via __suspense VNodes
  → Resolved data renders into HTML
```

**Key insight:** This mostly works already! The Suspense + streaming pipeline handles async content. The missing piece is that `query()` on the server needs to:

1. Execute the thunk (it does)
2. Register the result in a **server-side cache collector** (it doesn't)
3. The cache collector serializes all results at the end of the stream

**Implementation:**

```typescript
// New: ServerQueryContext — collects query results during SSR
interface ServerQueryContext {
  cache: Map<string, unknown>;  // key → serialized result
  register(key: string, data: unknown): void;
  serialize(): string;  // JSON script tag for client
}

// renderToStream gains a query context
function renderToStream(tree: VNode, options?: RenderToStreamOptions & {
  queryContext?: ServerQueryContext;
}): ReadableStream<Uint8Array>
```

**Scope:** ~1 file (server-query-context.ts) + modifications to render-to-stream.ts

### Piece 2: Data serialization (server → client)

**What:** After all queries resolve, inject a `<script>` tag containing the serialized cache.

**Where it goes:** At the end of the streamed HTML, after all template chunks:

```html
<!-- Suspense template chunks -->
<template id="v-tmpl-1">...</template>
<script>...</script>

<!-- Query cache (NEW) -->
<script id="__VERTZ_DATA__" type="application/json">
{
  "cache": {
    "query:users:list:{}": { "data": [...], "fetchedAt": 1708300000 },
    "query:user:get:{\"id\":\"123\"}": { "data": {...}, "fetchedAt": 1708300000 }
  }
}
</script>
```

**Why JSON in a script tag:**
- No XSS risk with `type="application/json"` (browser doesn't execute it)
- Parsed once on client, O(1) lookup per query
- Same pattern React/Next.js uses for `__NEXT_DATA__`

**Scope:** ~1 function added to render-to-stream.ts or render-page.ts

### Piece 3: Client cache hydration

**What:** On client startup, before any `query()` runs, read `__VERTZ_DATA__` and pre-populate the cache.

```typescript
// New: hydrateQueryCache() — called before hydrate(registry)
function hydrateQueryCache(cache?: CacheStore): void {
  const el = document.getElementById('__VERTZ_DATA__');
  if (!el) return;
  
  const data = JSON.parse(el.textContent!);
  const store = cache ?? globalCache;
  
  for (const [key, value] of Object.entries(data.cache)) {
    store.set(key, value);
  }
  
  el.remove();  // Clean up
}
```

**Then `query()` works automatically:**
1. Component hydrates
2. `query(thunk)` runs
3. Computes cache key from dependencies
4. Cache hit → returns `initialData` from SSR, no fetch
5. No refetch until stale time expires or manual revalidation

**Scope:** ~1 file (hydrate-cache.ts in `@vertz/ui`) + small integration in hydrate.ts

---

## The Developer Experience

### Before (today)
```typescript
// Component — query runs on client only, refetches after SSR
function UserList() {
  const users = query(() => api.users.list());
  // SSR: shows fallback (loading), then template chunk replaces it
  // Client: hydrates, query() fires AGAIN, loading flash
}
```

### After
```typescript
// Component — same code, works on both server and client
function UserList() {
  const users = query(() => api.users.list());
  // SSR: query executes on server, data rendered into HTML, cached
  // Client: hydrates, query() finds cached data, NO refetch
  // Zero loading flash. Instant interactive.
}
```

**Zero API change for the developer.** `query()` just works on both sides.

---

## Cache Key Consistency

The critical invariant: **server and client must compute the same cache key for the same query.**

Current key derivation in `query()`:
1. Base key from `deriveKey(thunk)` — function identity
2. Dependency hash from signal values read during thunk execution

On the server, signals don't exist (no reactivity). So the key must be derived from:
- The thunk's string representation or explicit `key` option
- The actual argument values passed to the API call

**Two approaches:**

**A) Explicit keys (simple, reliable):**
```typescript
const users = query(() => api.users.list(), { key: 'users:list' });
```
Server and client both use the explicit key. No ambiguity.

**B) Automatic key derivation (zero config, needs work):**
Server executes `thunk()`, captures the URL/params, derives key from those. Client derives key the same way through signal tracking.

**Recommendation:** Start with **A** (explicit keys) for SSR queries. Add **B** later. Explicit keys are predictable, debuggable, and what TanStack Query recommends.

---

## Implementation Plan

| Step | What | Package | Scope | Depends on |
|---|---|---|---|---|
| **1** | `ServerQueryContext` — collects query results during SSR | `@vertz/ui-server` | 1 new file, ~50 lines | — |
| **2** | Wire context into `renderToStream` — pass to component execution | `@vertz/ui-server` | Modify render-to-stream.ts | Step 1 |
| **3** | Serialize cache as `<script id="__VERTZ_DATA__">` at end of stream | `@vertz/ui-server` | Modify render-to-stream.ts or render-page.ts | Step 2 |
| **4** | `hydrateQueryCache()` — reads `__VERTZ_DATA__`, populates client cache | `@vertz/ui` | 1 new file, ~30 lines | — |
| **5** | Call `hydrateQueryCache()` before `hydrate(registry)` | `@vertz/ui` | Small modification to hydrate.ts | Step 4 |
| **6** | Server-side `query()` shim — executes thunk, registers in context | `@vertz/ui-server` | 1 new file, ~60 lines | Steps 1, 2 |
| **7** | Tests — SSR renders data, client hydrates without refetch | Both | ~2-3 test files | All above |

**Total estimate:** ~200-300 lines of new code across 3-4 files, plus tests.

**This is not a large change.** The streaming infrastructure already handles the hard part (Suspense, out-of-order resolution). We're adding a data collection layer on top.

---

## What This Enables Next

Once the bridge works:

1. **Skeleton delay (200ms)** — trivial to add in Step 6 (server query shim delays placeholder emission)
2. **Auto-inferred skeletons** — can be built on top of the slot placeholder system
3. **`query()` state model** (`pending`/`ready`/`error` + `isRevalidating`) — client-side enhancement, independent of SSR
4. **Stale-while-revalidate** — client shows SSR data immediately, revalidates in background after `staleTime`

---

## Open Questions

1. **Should `renderPage()` automatically create the `ServerQueryContext`, or should the developer pass it?** Recommendation: automatic. Less API surface.
2. **What about queries that shouldn't run on the server?** Add `{ ssr: false }` option to `query()`. Default is `true`.
3. **What about authenticated queries?** Server needs request context (cookies/headers) to make API calls. Pass via `renderPage(vnode, { request })`.
4. **Cache serialization size limit?** Large datasets shouldn't be inlined. Add a warning/truncation for payloads > 100KB.
