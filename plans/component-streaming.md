# Component Streaming for SSR [#672]

## Context

Phase 4 of the Universal Rendering Model (#664). Today, `renderToHTML()` uses a **two-pass blocking render**: pass 1 discovers queries, blocks until all resolve/timeout, pass 2 renders with data. The browser gets nothing until the slowest query either resolves or hits its `ssrTimeout`. Slow queries show "Loading..." and the **client** must refetch the data.

**Goal:** After the initial HTML is sent, **stream resolved data from the server** for slow queries — the client's reactive system swaps in the data automatically. No client-side refetch needed. Zero developer boilerplate.

**What changes for the user:** Nothing in component code. A slow API that previously showed "Loading..." until the client refetched now streams data from the server. The only visible difference is faster time-to-content.

## Architecture

### Data streaming (not HTML streaming)

Instead of trying to replace HTML sections in the stream (which requires VNode tree surgery and is fragile), the server streams **data** for slow queries. The client's reactive system handles rendering.

```
Server side:
  1. Two-pass render (like today) — fast queries have data, slow queries show loading
  2. Send initial HTML immediately (don't block on response.text())
  3. For each pending slow query, when it resolves:
     → Emit <script>window.__VERTZ_SSR_PUSH__("query-key", resolvedData)</script>
  4. Close stream when all queries resolve or hard timeout

Client side:
  1. Hydration starts — query() checks for pre-existing SSR data
  2. For streamed data: CustomEvent listener feeds data to query signals
  3. Reactive system updates the DOM (loading → data) automatically
```

### Global `ssrTimeout` default

Add a global `ssrTimeout` to `renderToHTML` options. Per-query `ssrTimeout` in `QueryOptions` overrides it. Propagated via `__VERTZ_SSR_TIMEOUT__` global hook (same pattern as `__VERTZ_IS_SSR__`).

```typescript
renderToHTML(App, { url: '/', ssrTimeout: 200 })  // all queries default to 200ms
query(() => fetch('/slow'), { ssrTimeout: 5000 })  // this one waits up to 5s
query(() => fetch('/fast'))                         // inherits global 200ms
query(() => fetch('/no-ssr'), { ssrTimeout: 0 })   // disabled for this query
```

## Implementation Plan

### Step 1: SSR data streaming runtime script

**File:** `packages/ui-server/src/ssr-streaming-runtime.ts` (new)

Tiny inline `<script>` (~200 bytes) injected into `<head>` that creates an event bus for streamed query data:

```javascript
window.__VERTZ_SSR_DATA__ = [];
window.__VERTZ_SSR_PUSH__ = function(key, data) {
  window.__VERTZ_SSR_DATA__.push({ key: key, data: data });
  document.dispatchEvent(new CustomEvent('vertz:ssr-data', { detail: { key: key, data: data } }));
};
```

**Test (RED):** Exported script string is valid JS, defines both globals.

### Step 2: `renderToHTML` returns streaming `Response`

**File:** `packages/ui-server/src/render-to-html.ts`

Change return type from `Promise<string>` to `Promise<Response>`. The Response body is a `ReadableStream`:

1. Keep two-pass render for initial HTML (unchanged)
2. Inject the streaming runtime script into `<head>`
3. Serialize initial HTML — enqueue to stream
4. For each pending slow query (registered but not resolved after pass 1):
   - Await the promise (no per-query timeout — let it resolve naturally, or use a hard max)
   - On resolve: emit `<script>window.__VERTZ_SSR_PUSH__("key", data)</script>`
   - On reject: skip (client will fetch)
5. Close stream

Add `renderToHTMLString()` wrapper for backward compat (calls `.text()` on Response).

**Test (RED):** `renderToHTML()` returns `Response`; body stream has 2+ chunks for slow queries.

### Step 3: Add `key` tracking to SSR query entries

**File:** `packages/ui-server/src/ssr-context.ts`

Extend `SSRQueryEntry` with the query's cache key so the streaming phase can emit `__VERTZ_SSR_PUSH__(key, data)`:

```typescript
export interface SSRQueryEntry {
  promise: Promise<unknown>;
  timeout: number;
  resolve: (data: unknown) => void;
  key: string;        // query cache key for client-side matching
  resolved?: boolean; // set to true after pass 1 await resolves
}
```

**File:** `packages/ui/src/query/query.ts`

Pass the cache key when registering:
```typescript
register({ promise, timeout: ssrTimeout, resolve, key });
```

**Test (RED):** Registered SSR query entry has `key` property matching the query's cache key.

### Step 4: Global `ssrTimeout` configuration

**File:** `packages/ui-server/src/ssr-context.ts`

Add global timeout hook:
```typescript
export function setGlobalSSRTimeout(timeout: number): void {
  (globalThis as any).__VERTZ_SSR_TIMEOUT__ = timeout;
}
```

**File:** `packages/ui-server/src/render-to-html.ts`

Set the global timeout before rendering:
```typescript
if (options.ssrTimeout !== undefined) {
  setGlobalSSRTimeout(options.ssrTimeout);
}
```

**File:** `packages/ui/src/query/query.ts`

Read global default:
```typescript
const globalTimeout = (globalThis as any).__VERTZ_SSR_TIMEOUT__;
const ssrTimeout = options.ssrTimeout ?? (typeof globalTimeout === 'number' ? globalTimeout : 100);
```

**Test (RED):** `query()` with no `ssrTimeout` uses global default when set; falls back to 100 when not set.

### Step 5: Client-side SSR data hydration

**File:** `packages/ui/src/query/ssr-hydration.ts` (new)

```typescript
export function hydrateQueryFromSSR(key: string, resolve: (data: unknown) => void): (() => void)
```

- Check `window.__VERTZ_SSR_DATA__` for data matching `key` — if found, call `resolve` immediately
- Add `vertz:ssr-data` event listener — on match, call `resolve`
- Return cleanup function to remove listener

**Test (RED):** Pre-existing data resolves immediately; event-based data resolves on dispatch; cleanup removes listener.

### Step 6: Wire `query()` to SSR hydration on client

**File:** `packages/ui/src/query/query.ts`

During client-side initialization (not SSR), if `window.__VERTZ_SSR_DATA__` exists (indicates SSR-rendered page):
- Call `hydrateQueryFromSSR(cacheKey, resolveCallback)`
- `resolveCallback` sets `data.value` and `loading.value = false`
- Dispose the listener on `query.dispose()`

**Test (RED):** Client-side query picks up data from `__VERTZ_SSR_DATA__` without fetching.

### Step 7: Integration tests — full streaming pipeline

**File:** `packages/ui-server/src/__tests__/streaming-queries.test.ts` (new)

1. Fast query (5ms, ssrTimeout: 100) → data in initial HTML, no streaming script
2. Slow query (500ms, ssrTimeout: 50) → loading in initial HTML, `__VERTZ_SSR_PUSH__` script in stream
3. Mixed fast + slow → fast data + slow loading in initial chunk, slow data script in later chunk
4. Failed slow query → no streaming script, no crash
5. `ssrTimeout: 0` → no streaming (current behavior)
6. Global ssrTimeout override → queries use global default

### Step 8: Update callers for new `Response` return type

**Files:**
- `packages/ui-server/src/dev-server.ts` — update to use `Response` body stream
- `examples/entity-todo/src/entry-server.ts` — update to use `renderToHTMLString()` or pipe `Response`

## Key Files

| File | Change |
|------|--------|
| `packages/ui-server/src/render-to-html.ts` | Return `Response` with streaming body; emit data scripts for slow queries |
| `packages/ui-server/src/ssr-context.ts` | Add `key`/`resolved` to `SSRQueryEntry`; global timeout hook |
| `packages/ui-server/src/ssr-streaming-runtime.ts` | **New:** Inline script for client-side SSR data event bus |
| `packages/ui/src/query/query.ts` | Pass `key` to SSR entry; read global timeout; client hydration hook |
| `packages/ui/src/query/ssr-hydration.ts` | **New:** Client-side listener for streamed SSR data |
| `packages/ui-server/src/__tests__/streaming-queries.test.ts` | **New:** E2E streaming pipeline tests |
| `packages/ui/src/query/__tests__/ssr-hydration.test.ts` | **New:** Client hydration unit tests |
| `packages/ui-server/src/dev-server.ts` | Update for `Response` return type |
| `examples/entity-todo/src/entry-server.ts` | Update for new API |

## Reusable Infrastructure

- `encodeChunk()` in `streaming.ts` — string to Uint8Array for stream chunks
- `ssrStorage` / `getSSRQueries()` in `ssr-context.ts` — per-request query registry
- `renderPage()` in `render-page.ts` — already returns `Response` with `ReadableStream`
- `createTemplateChunk()` pattern in `template-chunk.ts` — reference for script injection

## Verification

1. `bun test packages/ui-server/src/__tests__/` — all server tests pass
2. `bun test packages/ui/src/query/` — all query tests pass (SSR + hydration)
3. `bunx tsc --noEmit -p packages/ui-server/tsconfig.json` — typecheck clean
4. `bunx tsc --noEmit -p packages/ui/tsconfig.json` — typecheck clean
5. `bunx biome check --write packages/ui-server/src/ packages/ui/src/query/` — lint clean
6. Manual: `cd examples/entity-todo && bun run dev` — SSR streaming works
