# Component Streaming for SSR [#672]

## Context

Phase 4 of the Universal Rendering Model (#664). Today, `renderToHTML()` uses a **two-pass blocking render**: pass 1 discovers queries, blocks until all resolve/timeout, pass 2 renders with data. The browser gets nothing until the slowest query either resolves or hits its `ssrTimeout`. Slow queries show "Loading..." and the **client** must refetch the data.

**Goal:** After the initial HTML is sent, **stream resolved data from the server** for slow queries — the client's reactive system swaps in the data automatically. No client-side refetch needed. Zero developer boilerplate.

**What changes for the user:** Nothing in component code. A slow API that previously showed "Loading..." until the client refetched now streams data from the server. The only visible difference is faster time-to-content.

## Architecture

### Data streaming (not HTML streaming)

Instead of trying to replace HTML sections in the stream (which requires VNode tree surgery and is fragile), the server streams **data** for slow queries. The client's reactive system handles rendering.

**Why inline `<script>` over SSE/WebSockets?** Script tags work within the existing HTTP response — no new connection, no CORS, no reconnection logic. The codebase already uses this pattern in `createTemplateChunk()` for Suspense boundary replacement scripts. SSE would require a separate connection + endpoint, adding complexity for marginal benefit. The CSP and XSS concerns are addressed below.

```
Server side:
  1. Two-pass render (like today) — fast queries have data, slow queries show loading
  2. Send initial HTML immediately via streaming Response
  3. For each pending slow query, when it resolves:
     → Emit <script nonce="...">window.__VERTZ_SSR_PUSH__("query-key", safeData)</script>
  4. Close stream when all queries resolve or hard timeout (30s default)

Client side:
  1. Hydration starts — query() registers listener for SSR streamed data
  2. Listener checks buffered data array first (covers data-before-listener race)
  3. For new streamed data: CustomEvent feeds data to query signals
  4. Reactive system updates the DOM (loading → data) automatically
  5. After hydration: cleanup listeners + clear buffered data
```

### Security

**CSP nonce support:** All emitted `<script>` tags include the `nonce` attribute when provided. Follows the existing pattern in `createTemplateChunk()` (`template-chunk.ts:17`) which already escapes nonces via `escapeNonce()`. The nonce is passed through `RenderToHTMLOptions.nonce` (new field) and threaded to every streaming script chunk.

**XSS prevention in data serialization:** Query data is serialized using a safe serializer that escapes `</script>`, `</Script>`, `<!--`, and Unicode line/paragraph separators. This prevents script tag breakout attacks. The serializer escapes `<` as `\u003c` inside string values, which is safe in JSON and prevents `</script>` injection.

```typescript
function safeSerialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
```

### Global `ssrTimeout` default

Add a global `ssrTimeout` to `renderToHTMLStream` options. Per-query `ssrTimeout` in `QueryOptions` overrides it. Propagated via `__VERTZ_SSR_TIMEOUT__` global hook (same pattern as `__VERTZ_IS_SSR__`).

```typescript
renderToHTMLStream(App, { url: '/', ssrTimeout: 200 })       // all queries default to 200ms
query(() => fetch('/slow'), { ssrTimeout: 5000 })             // this one waits up to 5s
query(() => fetch('/fast'))                                    // inherits global 200ms
query(() => fetch('/no-ssr'), { ssrTimeout: 0 })              // skip SSR entirely for this query
```

### API naming — no breaking change

The existing `renderToHTML()` (returns `Promise<string>`) is **unchanged**. The new streaming API is a separate function:

- **`renderToHTMLStream()`** — returns `Response` with streaming body. New function.
- **`renderToHTML()`** — unchanged, returns `Promise<string>`. Internally calls `renderToHTMLStream()` then `.text()`.

This avoids a breaking change. Callers migrate at their own pace.

### Hard timeout and cleanup

**Server-side hard timeout:** Default 30 seconds. Configurable via `renderToHTMLStream(App, { streamTimeout: 30_000 })`. When triggered:
- All pending query promises are abandoned (not cancelled — we don't own the fetch)
- Stream is closed
- Client falls back to refetching for any queries that didn't stream

**Memory bounds:** The SSR context (`ssrStorage` via `AsyncLocalStorage`) is per-request and automatically garbage-collected when the request completes. No cross-request accumulation.

**Client-side cleanup:** `window.__VERTZ_SSR_DATA__` is cleared (set to `null`) after all registered queries have either received streamed data or started client-side fetching. The runtime script sets a one-time `vertz:ssr-hydration-complete` event that triggers cleanup.

### Race condition handling

**Data arrives before listener (buffered array pattern):**
1. Streaming runtime script creates `window.__VERTZ_SSR_DATA__ = []`
2. Each `__VERTZ_SSR_PUSH__` call pushes to the array AND dispatches an event
3. When `hydrateQueryFromSSR()` is called, it checks the array first — if data exists, resolves immediately
4. Then registers an event listener for data that arrives later
5. This covers both orderings: data-before-listener and listener-before-data

**Query starts fetching before streamed data arrives:**
- On client, if `window.__VERTZ_SSR_DATA__` exists (SSR-rendered page), `query()` registers a hydration listener BEFORE starting any fetch
- If streamed data arrives, it takes priority — the fetch is not started
- If no streamed data arrives within a short grace period (the stream closes), the client fetches normally

**Concurrent renders (server-side):**
- `ssrStorage` (AsyncLocalStorage) already provides per-request isolation. Each `renderToHTMLStream()` call runs in its own async context. No shared global state for query tracking. `setGlobalSSRTimeout()` is set inside the `ssrStorage.run()` callback, scoped to that request.

### Error handling

**Query rejects during streaming:**
- Error is logged server-side
- No script chunk is emitted for that query
- Client will fetch normally (loading state → client fetch → data)
- Remaining queries continue streaming — one failure doesn't abort others

**Stream abort (client disconnect):**
- `ReadableStream` cancel signal triggers cleanup
- Pending query promises are abandoned

**Dev-mode logging:**
- When `process.env.NODE_ENV !== 'production'`, log which queries streamed, which timed out, and which errored

### Key generation

Query cache keys follow the existing format in `query.ts`: `__q:<thunkHash>:<depHash>` where:
- `thunkHash` = djb2 hash of `fetcher.toString()`
- `depHash` = djb2 hash of `JSON.stringify(capturedValues).join('|')`

This is **deterministic and stable** between SSR and client because:
- Same `query()` call produces same thunk code → same hash
- Same captured values → same dep hash
- The key is generated by the same `query()` function on both sides

### `ssrTimeout: 0` behavior

Explicitly: when a query has `ssrTimeout: 0`, it is **not registered** with the SSR context at all. It shows "Loading..." in the initial HTML and the client fetches the data. No streaming, no server-side fetch. This is the current behavior, preserved.

## Implementation Plan

### Step 1: Safe serializer + streaming runtime script

**File:** `packages/ui-server/src/ssr-streaming-runtime.ts` (new)

Exports:
- `getStreamingRuntimeScript(nonce?: string)` — returns the inline `<script>` tag string
- `safeSerialize(data: unknown)` — JSON.stringify with `<` escaped as `\u003c`
- `createSSRDataChunk(key, data, nonce?)` — returns `<script nonce="...">window.__VERTZ_SSR_PUSH__("key", safeData)</script>`

Runtime script content (~200 bytes):

```javascript
window.__VERTZ_SSR_DATA__ = [];
window.__VERTZ_SSR_PUSH__ = function(key, data) {
  window.__VERTZ_SSR_DATA__.push({ key: key, data: data });
  document.dispatchEvent(new CustomEvent('vertz:ssr-data', { detail: { key: key, data: data } }));
};
```

**Tests (RED):**
1. `safeSerialize` escapes `</script>` in data values
2. `safeSerialize` handles `null`, nested objects, arrays
3. `getStreamingRuntimeScript()` without nonce — no nonce attribute
4. `getStreamingRuntimeScript('abc')` — includes `nonce="abc"`
5. `createSSRDataChunk` produces valid script with safe-serialized data

### Step 2: Add `key` tracking to SSR query entries

**File:** `packages/ui-server/src/ssr-context.ts`

Extend `SSRQueryEntry`:

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
register({ promise, timeout: ssrTimeout, resolve, key: cacheKey });
```

**Tests (RED):**
1. Registered SSR query entry has `key` property matching the query's cache key
2. `resolved` flag is set to `true` for queries that resolve within timeout

### Step 3: Global `ssrTimeout` configuration

**File:** `packages/ui-server/src/ssr-context.ts`

Add global timeout hook (set inside `ssrStorage.run()` for per-request isolation):
```typescript
export function setGlobalSSRTimeout(timeout: number): void {
  (globalThis as any).__VERTZ_SSR_TIMEOUT__ = timeout;
}
export function clearGlobalSSRTimeout(): void {
  delete (globalThis as any).__VERTZ_SSR_TIMEOUT__;
}
```

**File:** `packages/ui/src/query/query.ts`

Read global default:
```typescript
const globalTimeout = (globalThis as any).__VERTZ_SSR_TIMEOUT__;
const ssrTimeout = options.ssrTimeout ?? (typeof globalTimeout === 'number' ? globalTimeout : 100);
```

**Tests (RED):**
1. `query()` with no `ssrTimeout` uses global default when set
2. `query()` with no `ssrTimeout` falls back to 100 when global not set
3. Per-query `ssrTimeout` overrides global

### Step 4: `renderToHTMLStream()` — new streaming API

**File:** `packages/ui-server/src/render-to-html.ts`

New function `renderToHTMLStream()` that returns `Promise<Response>`:

1. Two-pass render for initial HTML (unchanged logic)
2. Inject streaming runtime script into `</head>` position
3. Enqueue initial HTML as first stream chunk
4. For each unresolved query (where `resolved !== true`):
   - Race the promise against `streamTimeout` (default 30s)
   - On resolve: emit `createSSRDataChunk(key, data, nonce)` to stream
   - On reject: log error, skip, continue with remaining queries
5. Close stream

Update existing `renderToHTML()` to call `renderToHTMLStream()` then `.text()` — preserving the current `Promise<string>` signature.

Add `nonce` and `streamTimeout` to `RenderToHTMLOptions`:
```typescript
interface RenderToHTMLOptions {
  // ...existing fields
  nonce?: string;           // CSP nonce for inline scripts
  ssrTimeout?: number;      // global default for per-query ssrTimeout
  streamTimeout?: number;   // hard timeout for entire stream (default 30s)
}
```

**Tests (RED):**
1. `renderToHTMLStream()` returns `Response` with streaming body
2. Fast query → data in initial HTML, no streaming scripts
3. Slow query → loading in initial HTML, data script streamed after
4. Nonce is included in streaming scripts when provided
5. `renderToHTML()` still returns `Promise<string>` (backward compat)
6. Hard timeout closes stream, remaining queries abandoned

### Step 5: Client-side SSR data hydration

**File:** `packages/ui/src/query/ssr-hydration.ts` (new)

```typescript
export function hydrateQueryFromSSR(
  key: string,
  resolve: (data: unknown) => void,
): (() => void)
```

1. Check `window.__VERTZ_SSR_DATA__` array for entry matching `key` — if found, call `resolve` immediately
2. Add `vertz:ssr-data` event listener for data that arrives later
3. Return cleanup function that removes listener

```typescript
export function cleanupSSRData(): void
```

Clears `window.__VERTZ_SSR_DATA__` and `window.__VERTZ_SSR_PUSH__`. Called after hydration is complete.

**Tests (RED):**
1. Pre-existing data in array → resolves immediately
2. Event-dispatched data → resolves on event
3. Cleanup removes listener + clears globals
4. Data for non-matching key is ignored

### Step 6: Wire `query()` to SSR hydration on client

**File:** `packages/ui/src/query/query.ts`

During client-side initialization (not SSR), if `window.__VERTZ_SSR_DATA__` exists:
- Call `hydrateQueryFromSSR(cacheKey, resolveCallback)` before starting fetch
- `resolveCallback` sets `data.value` and `loading.value = false`
- If hydration resolves, skip the fetch
- Dispose the listener on `query.dispose()`

**Tests (RED):**
1. Client-side query picks up pre-existing SSR data without fetching
2. Client-side query picks up event-streamed SSR data without fetching
3. Query without SSR data falls back to normal fetch
4. `dispose()` cleans up hydration listener

### Step 7: Integration tests — full streaming pipeline

**File:** `packages/ui-server/src/__tests__/streaming-queries.test.ts` (new)

Use deterministic patterns (deferred promises, not wall-clock timing):

1. Fast query (resolves before ssrTimeout) → data in initial HTML, no streaming script
2. Slow query (resolves after ssrTimeout) → loading in initial HTML, `__VERTZ_SSR_PUSH__` script in stream
3. Mixed fast + slow → fast data in initial chunk, slow data script in later chunk
4. Failed slow query → no streaming script for that query, no crash, remaining queries still stream
5. `ssrTimeout: 0` → no registration, no streaming
6. Global ssrTimeout override → queries use global default
7. Nonce propagation → all streaming scripts have nonce attribute
8. Hard timeout → stream closes, pending queries not emitted
9. Data contains `</script>` → properly escaped, no XSS

### Step 8: Update callers

**Files:**
- `packages/ui-server/src/dev-server.ts` — use `renderToHTMLStream()` and pipe the Response body
- `examples/entity-todo/src/entry-server.ts` — unchanged (still uses `renderToHTML()` → `Promise<string>`)
- `packages/ui-server/src/index.ts` — export `renderToHTMLStream`

## Key Files

| File | Change |
|------|--------|
| `packages/ui-server/src/render-to-html.ts` | Add `renderToHTMLStream()`; update `renderToHTML()` to delegate to it |
| `packages/ui-server/src/ssr-context.ts` | Add `key`/`resolved` to `SSRQueryEntry`; global timeout hook |
| `packages/ui-server/src/ssr-streaming-runtime.ts` | **New:** Safe serializer, runtime script generator, data chunk builder |
| `packages/ui/src/query/query.ts` | Pass `key` to SSR entry; read global timeout; client hydration hook |
| `packages/ui/src/query/ssr-hydration.ts` | **New:** Client-side listener for streamed SSR data |
| `packages/ui-server/src/__tests__/streaming-queries.test.ts` | **New:** E2E streaming pipeline tests |
| `packages/ui/src/query/__tests__/ssr-hydration.test.ts` | **New:** Client hydration unit tests |
| `packages/ui-server/src/dev-server.ts` | Opt in to streaming via `renderToHTMLStream()` |
| `packages/ui-server/src/index.ts` | Export `renderToHTMLStream` |

## Reusable Infrastructure

- `encodeChunk()` in `streaming.ts` — string → Uint8Array for stream chunks
- `ssrStorage` / `getSSRQueries()` in `ssr-context.ts` — per-request query registry (AsyncLocalStorage)
- `createTemplateChunk()` in `template-chunk.ts` — reference for nonce-aware script injection
- `escapeNonce()` in `template-chunk.ts` — existing nonce escaping utility
- `escapeHtml()` in `html-serializer.ts` — existing HTML escaping

## Non-Goals

- **HTML streaming / Suspense integration** — we stream data, not HTML fragments. Suspense remains CSR-only.
- **Micro-frontend isolation** — single Vertz app per page. Multi-app isolation is a separate concern.
- **DevTools integration** — dev-mode console logging is included, but a browser extension or panel is out of scope.
- **CDN cache headers** — streaming responses are not cacheable by design. Cache at the reverse proxy layer if needed.

## Verification

1. `bun test packages/ui-server/src/__tests__/` — all server tests pass
2. `bun test packages/ui/src/query/` — all query tests pass (SSR + hydration)
3. `bunx tsc --noEmit -p packages/ui-server/tsconfig.json` — typecheck clean
4. `bunx tsc --noEmit -p packages/ui/tsconfig.json` — typecheck clean
5. `bunx biome check --write packages/ui-server/src/ packages/ui/src/query/` — lint clean
6. Manual: `cd examples/entity-todo && bun run dev` — SSR works (uses `renderToHTML()`, no streaming)
7. Verify `</script>` in query data doesn't cause XSS — integration test #9
