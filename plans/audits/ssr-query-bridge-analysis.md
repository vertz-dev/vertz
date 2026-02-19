# SSR-Query Bridge Analysis

> Technical summary of client-side `query()` and server-side streaming SSR
> Focus: interfaces/contracts for state serialization and query integration

---

## 1. Client Query Implementation (`packages/ui/src/query/query.ts`)

### Function Signature

```typescript
function query<T>(
  thunk: () => Promise<T>,
  options?: QueryOptions<T>
): QueryResult<T>
```

### QueryOptions Interface

```typescript
interface QueryOptions<T> {
  initialData?: T;           // Pre-populated data — skips initial fetch
  debounce?: number;         // Debounce re-fetches (ms)
  enabled?: boolean;        // When false, no fetch (default: true)
  key?: string;              // Explicit cache key (otherwise derived)
  cache?: CacheStore<T>;     // Custom cache store (default: MemoryCache)
}
```

### QueryResult Interface (Return Type)

```typescript
interface QueryResult<T> {
  readonly data: ReadonlySignal<T | undefined>;
  readonly loading: ReadonlySignal<boolean>;
  readonly error: ReadonlySignal<unknown>;
  refetch: () => void;
  revalidate: () => void;
  dispose: () => void;
}
```

### CacheStore Interface

```typescript
interface CacheStore<T = unknown> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
}
```

### Key Data Structures

- **`depHashSignal: Signal<string>`** — Captures reactive dependency values; used to derive cache keys from actual signal values (not monotonic counters)
- **`inflight: Map<string, Promise<unknown>>`** — Global registry for deduplicating concurrent requests with the same cache key
- **`inflightKeys: Set<string>`** — Per-query instance tracking of in-flight keys for cleanup on dispose
- **`fetchId: number`** — Monotonic counter to ignore stale responses

### How Async Data Flows

1. **Thunk execution**: `callThunkWithCapture()` wraps the thunk, tracking signal reads via `setReadValueCallback`
2. **Dependency capture**: Signal values read during thunk execution are serialized and hashed to create a dependency-based cache key
3. **Deduplication**: If an in-flight promise exists for the same key, it reuses that promise instead of triggering a new fetch
4. **Cache check**: On subsequent runs with identical dependency values, data is served from cache without refetching
5. **Signal updates**: `handleFetchPromise()` updates `data`, `loading`, and `error` signals on resolve/reject

### Integration Points

- **Cache**: Accepts custom `CacheStore` — default is `MemoryCache` (in-memory Map)
- **Key derivation**: Uses `deriveKey(thunk)` for base key + dependency hash for computed key
- **Cleanup**: `dispose()` stops the reactive effect, clears debounce timer, and removes all in-flight entries for this query instance

---

## 2. Cache Implementation (`packages/ui/src/query/cache.ts`)

### MemoryCache Class

```typescript
class MemoryCache<T = unknown> implements CacheStore<T> {
  private _store = new Map<string, T>();
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
}
```

### Key Notes

- Simple in-memory Map-based cache
- No eviction policy (unbounded)
- `CacheStore` interface allows custom implementations (LRU, persistent, etc.)

---

## 3. Server Streaming SSR (`packages/ui-server/src/render-to-stream.ts`)

### Function Signature

```typescript
function renderToStream(
  tree: VNode | string | RawHtml,
  options?: RenderToStreamOptions
): ReadableStream<Uint8Array>
```

### RenderToStreamOptions Interface

```typescript
interface RenderToStreamOptions {
  nonce?: string;  // CSP nonce for inline scripts
}
```

### SuspenseVNode Interface (Internal)

```typescript
interface SuspenseVNode extends VNode {
  tag: '__suspense';
  _fallback: VNode | string;
  _resolve: Promise<VNode | string>;
}
```

### How Async Data Flows

1. **Phase 1 — Synchronous walk**: `walkAndSerialize()` traverses the VNode tree, serializing synchronous content immediately
2. **Suspense detection**: When a `SuspenseVNode` (tag: `__suspense`) is encountered:
   - Creates a slot placeholder via `createSlotPlaceholder()`
   - Pushes to `pendingBoundaries` array with the slot ID and the resolve promise
3. **Initial output**: Emits HTML with `<div id="v-slot-N">fallback</div>` placeholders
4. **Phase 2 — Resolution**: After initial content, waits for all suspense promises:
   - Resolved content → `createTemplateChunk()` generates replacement HTML
   - Error → emits error placeholder `<div data-v-ssr-error="true">`
5. **Out-of-order streaming**: Resolution chunks are appended after main content; browser swaps them in via the inline script

### Integration Points

- **`createSlotPlaceholder()`** — Called from `slot-placeholder.ts`
- **`createTemplateChunk()`** — Called from `template-chunk.ts`
- **`serializeToHtml()`** — Serializes VNodes to HTML strings
- **`encodeChunk()`** — Encodes strings to Uint8Array for stream

---

## 4. Page Rendering API (`packages/ui-server/src/render-page.ts`)

### Function Signature

```typescript
function renderPage(vnode: VNode, options?: PageOptions): Response
```

### PageOptions Interface

```typescript
interface PageOptions {
  status?: number;           // HTTP status (default: 200)
  title?: string;           // Page title
  description?: string;     // Meta description
  lang?: string;            // Language attribute (default: 'en')
  favicon?: string;         // Favicon URL
  og?: {                    // Open Graph meta tags
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
  };
  twitter?: {               // Twitter card meta tags
    card?: string;
    site?: string;
  };
  scripts?: string[];       // Script URLs at end of body
  styles?: string[];        // Stylesheet URLs in head
  head?: string;           // Raw HTML escape hatch for head
}
```

### How Async Data Flows

1. Builds `<head>` HTML from `PageOptions` via `buildHeadHtml()`
2. Creates a `ReadableStream` that emits the full HTML document:
   - Doctype + `<html>` + `<head>` + `<body>` (synchronous)
   - **Component content**: pipes `renderToStream(vnode)` output into the body
   - Scripts + closing tags
3. Returns a `Response` with `text/html` content-type

### Integration Points

- **`renderToStream()`** — Called to stream component content into the body
- **`renderHeadToHtml()`** — Renders head entries to HTML
- **`encodeChunk()`** — Encodes strings for the stream

---

## 5. Template Chunk for Out-of-Order Streaming (`packages/ui-server/src/template-chunk.ts`)

### Function Signature

```typescript
function createTemplateChunk(
  slotId: number,
  resolvedHtml: string,
  nonce?: string
): string
```

### How It Works

Generates HTML that enables client-side replacement:

```html
<template id="v-tmpl-{slotId}">{resolvedHtml}</template>
<script nonce="{nonce}">
  (function(){
    var s = document.getElementById("v-slot-{slotId}");
    var t = document.getElementById("v-tmpl-{slotId}");
    if(s && t) { s.replaceWith(t.content.cloneNode(true)); t.remove() }
  })()
</script>
```

### Integration Points

- Called from `render-to-stream.ts` when suspense boundaries resolve
- Slot IDs are generated by `createSlotPlaceholder()` in `slot-placeholder.ts`

---

## 6. Suspense Slot Placeholder (`packages/ui-server/src/slot-placeholder.ts`)

### Function Signature

```typescript
function createSlotPlaceholder(fallback: VNode | string): VNode & { _slotId: number }
```

### Return Type

```typescript
interface VNodeWithSlotId {
  tag: 'div';
  attrs: { id: `v-slot-${number}` };
  children: VNode[];
  _slotId: number;
}
```

### How It Works

1. Generates a unique slot ID (incremental counter)
2. Creates a `<div id="v-slot-{id}">` containing the fallback content
3. Returns the VNode with `_slotId` for tracking

### Integration Points

- Called from `render-to-stream.ts` when encountering SuspenseVNode
- Slot ID used by `createTemplateChunk()` for matching placeholder → resolved content

---

## 7. Suspense Component (`packages/ui/src/component/suspense.ts`)

### Function Signature

```typescript
function Suspense(props: SuspenseProps): Node
```

### SuspenseProps Interface

```typescript
interface SuspenseProps {
  children: () => Node;    // May throw a Promise
  fallback: () => Node;     // Shown while pending
}
```

### How Async Data Flows (Client-Side)

1. Attempts to render `props.children()` synchronously
2. If a Promise is thrown (suspense):
   - Renders `props.fallback()` as placeholder
   - Attaches `.then()` handler to replace placeholder with resolved children
   - Attaches `.catch()` handler to propagate errors to ErrorBoundary
3. If non-Promise error thrown: re-throws for ErrorBoundary handling
4. Error propagation: uses `getCurrentErrorHandler()` to find nearest ErrorBoundary; falls back to `queueMicrotask(() => { throw error; })`

### Integration Points

- **`getCurrentErrorHandler()`** — Retrieves ErrorBoundary context
- **`propagateError()`** — Sends errors to ErrorBoundary or surfaces globally

---

## 8. Client Hydration (`packages/ui/src/hydrate/hydrate.ts`)

### Function Signature

```typescript
function hydrate(registry: ComponentRegistry): void
```

### HydrationStrategy Type

```typescript
type HydrationStrategy = 'eager' | 'interaction' | 'lazy' | 'idle' | 'media' | 'visible';
```

### How It Works

1. Scans DOM for elements with `data-v-id` attribute
2. Skips elements already marked `data-v-hydrated`
3. For each element:
   - Gets `hydrate` attribute for strategy (default: `lazy`)
   - Deserializes props from DOM attributes via `deserializeProps()`
   - Resolves component from registry
   - Applies strategy to schedule hydration
4. Strategies:
   - **eager**: Immediate hydration
   - **lazy**: On first interaction
   - **interaction**: On click/focus events
   - **idle**: Via `requestIdleCallback`
   - **media**: When media query matches
   - **visible**: When element enters viewport

### Integration Points

- **`ComponentRegistry`** — Registry to resolve component ID → component function
- **`deserializeProps()`** — Extracts props from SSR-rendered DOM attributes
- **`resolveComponent()`** — Async component resolution (dynamic import)
- **Strategies** (`eagerStrategy`, `idleStrategy`, etc.) — Various timing approaches

---

## Bridge Design Points

### Where State Serialization Would Plug In

| Server Phase | Client Phase | Bridge Point |
|--------------|--------------|--------------|
| `renderToStream()` emits Suspense placeholders | `hydrate()` scans for `data-v-id` | SSR must emit component markers |
| Suspense resolves → `createTemplateChunk()` | `Suspense` component on client | Use same slot ID mechanism |
| `query()` has `initialData` option | Cache is empty on first load | Pre-populate cache from SSR |
| — | `query()` computes cache key from dependency values | Need to serialize deps for matching |

### Key Contracts to Maintain

1. **Slot ID consistency**: Server-generated slot IDs must match client-side Suspense expectations
2. **Component markers**: `data-v-id` format must be agreed between SSR and hydration
3. **Props serialization**: `deserializeProps()` must match whatever SSR serializes
4. **Cache key derivation**: Client-side key computation must be reproducible on server for prefetching
5. **Error handling**: Server-side error placeholders (`data-v-ssr-error`) must align with client ErrorBoundary

### Not Currently Connected

- `query()` does not automatically integrate with SSR — `initialData` must be explicitly passed
- No built-in mechanism to serialize query cache state from server to client
- No automatic prefetching based on server-side Suspense resolution
