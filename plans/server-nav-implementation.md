# Implementation Plan: Server-Rendered Client-Side Navigations (#690)

## Context

With #673, the initial page load SSR works well — queries that resolve within a threshold are pre-rendered, no loading flash. But when the user navigates **client-side** (clicks a Link), the target page renders entirely in the browser. Queries start from scratch — showing "Loading tasks..." before data arrives. This is a degraded experience compared to the SSR'd initial load.

**Goal:** When a user clicks a navigation link, the framework sends a parallel request to the dev server to pre-fetch the target page's query data. Navigation is NEVER blocked (unlike Remix). Data that resolves within the threshold arrives before/during page mount. Graceful fallback to SPA if anything fails.

**Approach:** Data-only pre-fetch via SSE. Server returns only query data (not HTML), client injects into the existing `__VERTZ_SSR_DATA__` hydration bus. Design doc: `plans/server-rendered-client-navigations.md`.

### Scope: Dev-Server Only

This feature targets the **Vite dev server** exclusively. The nav handler lives in `@vertz/ui-compiler` (Vite plugin middleware) and is not part of the production build. In production, SSR is handled by deployment-specific packages (e.g., `@vertz/cloudflare`) which have their own server infrastructure. Porting nav pre-fetch to production SSR servers is a separate future effort — the client-side code (`server-nav.ts`, `query.ts` changes) is runtime-agnostic and will work with any server that implements the `X-Vertz-Nav` SSE protocol.

### Cache Invalidation After Mutations

The prefetch mechanism only handles **reads** (GET navigations). After mutations (POST/PUT/DELETE), the existing query cache invalidation handles staleness — `refetchTrigger` and cache eviction on mutations are separate concerns. The prefetch seeds the cache; mutations invalidate it through the existing `refetch()` / `revalidate()` paths. No additional work needed here.

---

## Phase 1: Server-Side Nav Handler

**Package:** `@vertz/ui-compiler`

### Files

| File | Action |
|------|--------|
| `packages/ui-compiler/src/nav-handler.ts` | **New** — server-side SSE nav handler |
| `packages/ui-compiler/src/vite-plugin.ts` | Modify — add `discoverQueries` to SSR entry, nav check in middleware, extract invalidation helper |
| `packages/ui-compiler/src/__tests__/nav-handler.test.ts` | **New** — tests |

### Key Reusable Code

- **SSR entry generation** (`vite-plugin.ts:478-578`): `discoverQueries` is Pass 1 only (no Pass 2 render). Reuses `ssrStorage.run()`, `getSSRQueries()`, `Promise.allSettled` + per-query timeouts, cleanup pattern.
- **Module invalidation** (`vite-plugin.ts:189-211`): Extract `invalidateSSRModuleTree(server)` helper. Both SSR middleware and nav handler call it.
- **`safeSerialize`** from `@vertz/ui-server/ssr-streaming-runtime`: Escape data in SSE events to prevent injection.

### TDD Cycles

1. **Generated SSR entry includes `discoverQueries` export** — codegen test asserting the virtual module contains `export async function discoverQueries`. Implementation: add to `generateSSREntry()` string template — same setup as `renderToString` but returns after Pass 1 query resolution with `{ resolved: [{key, data}] }`.

2. **`discoverQueries` calls `createApp()` only once (no Pass 2)** — codegen test counting `createApp()` calls in the discoverQueries section.

3. **Nav handler skips non-nav requests** — req without `X-Vertz-Nav` header → `next()` called, no SSE response.

4. **Nav handler responds with `text/event-stream`** — req with `X-Vertz-Nav: 1` → `res.writeHead(200, { 'Content-Type': 'text/event-stream', ... })`.

5. **Nav handler streams resolved query data** — mock `discoverQueries` returning queries → verify `event: data\ndata: {"key":"...","data":...}\n\n` in response writes.

6. **Nav handler sends `done` event** — verify `event: done\ndata: {}\n\n` after all data events, then `res.end()`.

7. **Nav handler handles SSR errors gracefully** — mock throwing `ssrLoadModule` → still sends `event: done` + closes (client falls back).

8. **Nav handler uses `safeSerialize` for data** — mock data containing `</script>` → output contains `\u003c`.

9. **Nav handler middleware registered in `configureServer`** — add `X-Vertz-Nav` check at the top of the existing middleware (before the `Accept: text/html` check). If `X-Vertz-Nav: 1`, delegate to `handleNavRequest()`.

### Acceptance

Nav handler responds to `X-Vertz-Nav: 1` requests with SSE events containing query data. Requests without the header pass through to existing SSR middleware. Errors produce a `done` event (graceful degradation).

---

## Phase 2: Client-Side Pre-Fetch

**Package:** `@vertz/ui`

### Files

| File | Action |
|------|--------|
| `packages/ui/src/router/server-nav.ts` | **New** — `parseSSE`, `ensureSSRDataBus`, `pushNavData`, `prefetchNavData`, `isNavPrefetchActive` |
| `packages/ui/src/router/__tests__/server-nav.test.ts` | **New** — tests |
| `packages/ui/src/query/query.ts` | Modify — add nav prefetch awareness (lines ~192-204) |
| `packages/ui/src/query/__tests__/query-ssr.test.ts` | Modify — add nav prefetch integration tests |

### Key Reusable Code

- **`hydrateQueryFromSSR()`** (`ssr-hydration.ts`): Already handles buffer check + event listener. No modification needed — `ensureSSRDataBus()` re-creates the globals it reads.
- **`__VERTZ_SSR_PUSH__` pattern** from `ssr-streaming-runtime.ts:getStreamingRuntimeScript()`: The bus creation logic (push to array + dispatch CustomEvent) is replicated in `ensureSSRDataBus()`.

### TDD Cycles — SSE Parser

1. **`parseSSE` parses single complete event** — `'event: data\ndata: {...}\n\n'` → `{ events: [{type: 'data', data: '...'}], remaining: '' }`.
2. **`parseSSE` handles partial buffer** — incomplete event (no trailing `\n\n`) → `{ events: [], remaining: buffer }`.
3. **`parseSSE` parses multiple events** — two events in one buffer → both returned.

### TDD Cycles — Bus Management

4. **`ensureSSRDataBus` creates globals** — after call, `__VERTZ_SSR_DATA__` is `[]` and `__VERTZ_SSR_PUSH__` is a function.
5. **`ensureSSRDataBus` clears stale data** — existing buffer data is reset to `[]`.
6. **`pushNavData` dispatches `vertz:ssr-data` event** — push data → event handler receives `{ key, data }` in detail.
7. **`pushNavData` adds to buffer array** — push data → `__VERTZ_SSR_DATA__` contains the entry.

### TDD Cycles — `prefetchNavData`

8. **Sends `X-Vertz-Nav` header** — mock fetch, verify headers.
9. **Sets `__VERTZ_NAV_PREFETCH_ACTIVE__` before fetch** — flag is `true` while request is in-flight.
10. **Pushes SSE data into hydration bus** — mock ReadableStream with SSE events → data appears in `__VERTZ_SSR_DATA__`.
11. **Clears active flag and dispatches `vertz:nav-prefetch-done` on completion** — after `done` event, flag is `false` and done event fired.
12. **`abort()` cancels the fetch** — returned handle's `abort()` triggers `AbortController.abort()`.
13. **Graceful degradation on fetch error** — rejected fetch → flag cleared, no uncaught error.
14. **Timeout aborts the fetch** — configurable timeout triggers abort after elapsed time. Default timeout: **5000ms**.
15. **`prefetchNavData` when already active ignores second call** — call `prefetchNavData` twice without abort → second call is a no-op (the first prefetch's bus and flag are already set). Prevents duplicate SSE connections.

### TDD Cycles — `query.ts` No-Double-Fetch

15. **Query defers client fetch while `__VERTZ_NAV_PREFETCH_ACTIVE__`** — set flag to `true` + provide `__VERTZ_SSR_DATA__` → query thunk NOT called.
16. **Query receives data from buffer (pre-mount)** — data in buffer before query mounts → `data.value` populated, no fetch.
17. **Query receives data via `vertz:ssr-data` event (post-mount)** — data streamed after mount → resolved via existing hydration listener.
18. **Query falls back to client fetch after done with no data** — dispatch `vertz:nav-prefetch-done` without providing data → query fetches client-side.
19. **Late SSE data after `done` is ignored** — query starts client fetch after `done`, then a stale SSE `vertz:ssr-data` event arrives → query ignores it (the `ssrHydrationCleanup` listener was already removed, and `ssrHydrated` prevents double-resolution).

### `query.ts` Change Detail

After the existing SSR hydration block (line ~204), add:

```typescript
// If SSR hydration found data, skip. Otherwise check nav prefetch.
if (!ssrHydrated && ssrHydrationCleanup !== null && isNavPrefetchActive()) {
  // Don't start client fetch — wait for SSE to finish
  const doneHandler = () => {
    document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
    if (data.peek() === undefined) {
      refetchTrigger.value = refetchTrigger.peek() + 1;
    }
  };
  document.addEventListener('vertz:nav-prefetch-done', doneHandler);

  // Chain cleanup: both the SSR hydration listener AND the done listener
  // must be removed on dispose/abort. Wrap the existing ssrHydrationCleanup.
  const prevCleanup = ssrHydrationCleanup;
  ssrHydrationCleanup = () => {
    prevCleanup?.();
    document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
  };
}
```

The key insight: `ssrHydrationCleanup !== null` means `__VERTZ_SSR_DATA__` exists (bus was re-created by `ensureSSRDataBus`), but the query's key wasn't found in the buffer yet. If prefetch is active, defer rather than immediately falling through to the client fetch.

**Cleanup guarantee:** The `ssrHydrationCleanup` chain ensures that on `dispose()`, abort, or when data arrives via the hydration bus, **both** the `vertz:ssr-data` listener (from `hydrateQueryFromSSR`) and the `vertz:nav-prefetch-done` listener are removed. No listeners accumulate across navigations.

### Acceptance

`prefetchNavData()` fetches SSE from server, injects data into hydration bus. Queries defer client-side fetches while SSE is active. No double fetches. Graceful degradation to SPA on errors.

---

## Phase 3: Router Integration

**Package:** `@vertz/ui`

### Files

| File | Action |
|------|--------|
| `packages/ui/src/router/navigate.ts` | Modify — add `RouterOptions`, call `prefetchNavData` |
| `packages/ui/src/router/__tests__/navigate.test.ts` | Modify — add serverNav tests |
| `packages/ui/src/index.ts` | Modify — export `RouterOptions` |

### Design Decision: Dependency Injection

Rather than module-mocking `prefetchNavData` in tests, pass it via `RouterOptions`:

```typescript
export interface RouterOptions {
  /** Enable server-assisted navigation pre-fetching. Default timeout: 5000ms. */
  serverNav?: boolean | { timeout?: number };
  /** @internal — injected for testing. Production uses the real module. */
  _prefetchNavData?: typeof prefetchNavData;
}
```

When `serverNav: true`, the default timeout is **5000ms** (generous to avoid aborting slow-but-valid responses). When `serverNav: { timeout: 2000 }`, the timeout is explicit. This makes testing clean without `vi.mock()` brittleness. The router dynamically imports `server-nav.ts` when `serverNav` is enabled (lazy import avoids bundling the module when unused).

### TDD Cycles

1. **`createRouter` accepts `RouterOptions` as third parameter** — new `{ serverNav: true }` option.
2. **`RouterOptions` exported from `@vertz/ui`** — add to `index.ts`.
3. **`navigate()` calls `prefetchNavData` when `serverNav` enabled** — verify call with URL.
4. **`navigate()` skips prefetch when `serverNav` disabled** — verify NOT called.
5. **Rapid navigation aborts previous prefetch** — first prefetch's `abort()` called on second navigate.
6. **`dispose()` aborts active prefetch** — cleanup on router teardown.
7. **`serverNav: { timeout: N }` passes timeout** — verify timeout forwarded.
8. **`popstate` triggers prefetch** — back/forward button also pre-fetches.
9. **Re-navigation to same URL after abort triggers new prefetch** — navigate to `/a` → abort → navigate to `/a` again → prefetch fires again (no stale dedup).
10. **`popstate` during active prefetch aborts previous** — prefetch in-flight → browser back → previous prefetch aborted, new one starts.

### Acceptance

`createRouter(routes, url, { serverNav: true })` enables server-assisted navigation. Navigation is never blocked. Rapid re-navigation and disposal abort in-flight prefetches.

---

## Phase 4: Link Hover Prefetch

**Package:** `@vertz/ui`

### Files

| File | Action |
|------|--------|
| `packages/ui/src/router/link.ts` | Modify — add `prefetch: 'hover'` prop, `onPrefetch` |
| `packages/ui/src/router/__tests__/link.test.ts` | Modify — add hover prefetch tests |

### TDD Cycles

1. **`createLink` accepts `onPrefetch` callback option** — third parameter `{ onPrefetch }`.
2. **`mouseenter` fires `onPrefetch` when `prefetch: 'hover'`** — dispatch MouseEvent → callback called with href.
3. **`focus` fires `onPrefetch` when `prefetch: 'hover'`** — dispatch FocusEvent → callback called.
4. **No prefetch without `prefetch` prop** — events dispatched → callback NOT called.
5. **Only fires once per link (dedup)** — multiple events → callback called once.

### Router Wiring

The router creates the Link factory with `onPrefetch` wired to its own `prefetchNavData`:

```typescript
// In router or app setup
const Link = createLink(currentPath, navigate, {
  onPrefetch: serverNav ? (url) => prefetchNavData(url, serverNavConfig) : undefined,
});
```

### Known Limitation: Touch Devices

`mouseenter` and `focus` don't fire on tap on mobile devices, so hover prefetch won't trigger on touch. This is acceptable for MVP — the `serverNav` option in Phase 3 still pre-fetches on navigation (click/tap), which is the primary path. Touch-specific triggers (e.g., `touchstart`) can be added in a follow-up if needed.

### Acceptance

Links with `prefetch: 'hover'` trigger server pre-fetch on mouseenter/focus. Fires once per element.

---

## Phase 5: End-to-End Verification

Playwright tests using the `task-manager` example app with SSR enabled.

### Test Scenarios

1. **Regression: SSR initial load still works** — no loading flash on `/`.
2. **Client nav pre-fetch works** — load `/` → click task → no loading flash on detail page. Verify `X-Vertz-Nav` request in network.
3. **Reverse nav works** — load detail → click "All Tasks" → no loading flash on list.
4. **Rapid re-navigation safe** — click link, immediately click another → no errors, correct page rendered.
5. **Graceful degradation** — slow server → page renders with loading state, data arrives later.

---

## Verification

After each phase:
1. `bun test` — all tests pass
2. `bun run typecheck --filter @vertz/ui-compiler --filter @vertz/ui` — types clean
3. `bunx biome check --write` — lint/format clean

After all phases:
4. `bun run typecheck --filter @vertz/integration-tests` — cross-package types clean
5. Manual test with task-manager example app — navigate between pages, verify no loading flash
6. Network tab inspection — SSE request visible with correct headers

---

## Changeset

```markdown
---
'@vertz/ui-compiler': patch
'@vertz/ui': patch
---

feat(ui,ui-compiler): server-rendered client-side navigations

When `serverNav: true` is set on `createRouter()`, client-side navigations
pre-fetch query data from the dev server via SSE. Data that resolves within
the SSR threshold arrives before or during page mount, eliminating loading
flashes. Navigation is never blocked — graceful fallback to client-side
fetching if the server is unavailable.
```
