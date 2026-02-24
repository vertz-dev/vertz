# Server-Rendered Client-Side Navigations

## Context

With #673 complete, the initial page load SSR works well — data under the threshold is pre-rendered, no loading flash. But when the user navigates **client-side** (clicks a Link), the target page renders entirely in the browser. If that page has `query()` calls, they start from scratch — showing "Loading tasks..." before data arrives. This is a degraded experience compared to the SSR'd initial load.

**Goal:** When a user clicks a navigation link, the framework sends a parallel request to the dev server to pre-fetch the target page's query data using the same threshold-based approach. Data that resolves within the threshold arrives before or as the page mounts (no loading flash). Data that takes longer streams in progressively. Navigation is never blocked.

**Key differentiator from Remix:** Remix blocks navigation until ALL loaders resolve. Vertz navigation is immediate and non-blocking — the page renders right away with whatever data is available. The server pre-fetch is a best-effort enhancement.

## Approach: Data-Only Pre-Fetch via SSE

The server returns **only query data** (not HTML), and the client injects it into the existing `__VERTZ_SSR_DATA__` hydration bus. This reuses the `hydrateQueryFromSSR()` mechanism that already exists.

**Why data-only (not HTML fragments):** Returning HTML would create a second rendering code path (parse HTML, swap innerHTML, re-hydrate), violating "one way to do things." The client already renders pages — it just needs pre-fetched data.

**Why SSE:** Server-Sent Events provide a natural streaming format. The server sends resolved query data as events arrive, then closes with a `done` event. Since `EventSource` doesn't support custom headers, we use `fetch()` with manual SSE parsing.

### No-Double-Fetch Guarantee

Critical design constraint: if the server pre-fetch is in-flight and hasn't completed within the threshold, the client **must not** start a duplicate fetch. Instead:

1. `prefetchNavData()` sets `window.__VERTZ_NAV_PREFETCH_ACTIVE__ = true` before the SSE request starts
2. When `query()` mounts and finds `__VERTZ_NAV_PREFETCH_ACTIVE__`, it registers a `vertz:ssr-data` event listener and **defers its client-side fetch**
3. When the SSE `done` event fires, `prefetchNavData()` sets `__VERTZ_NAV_PREFETCH_ACTIVE__ = false` and dispatches a `vertz:nav-prefetch-done` event
4. Queries that didn't receive data from the SSE stream then fall back to their normal client-side fetch

This means: fast data arrives before or during mount (buffer hit). Slow data arrives via streamed SSE events (event listener hit). If the SSE closes without data for a query, the query fetches client-side. **One request per query, never two.**

This requires a small change to `query.ts` — the SSR hydration check needs to also handle the "prefetch active, wait for done" case. See Phase 2 for details.

### No-JS Progressive Enhancement

When JavaScript is disabled, clicking `<a href="/tasks/123">` triggers a full page request with `Accept: text/html`. The existing SSR middleware renders the complete page with pre-fetched data. The `X-Vertz-Nav` header is only sent by client-side JS — no-JS users get full SSR pages automatically.

## Data Flow

```
User clicks Link
  |
  ├─ prefetchNavData('/tasks/123')        [fire-and-forget fetch]
  │   └─ ensureSSRDataBus()               [re-create __VERTZ_SSR_DATA__ + __VERTZ_SSR_PUSH__]
  │   └─ fetch('/tasks/123', { headers: { 'X-Vertz-Nav': '1' } })
  │
  ├─ history.pushState(...)               [immediate, not blocked]
  └─ applyNavigation('/tasks/123')        [immediate, not blocked]
      └─ router.current.value = match
          └─ RouterView renders TaskDetailPage
              └─ query(() => fetchTask(id), { key: '...' })
                  └─ hydrateQueryFromSSR(key, resolve)
                      ├─ Found in buffer? → resolve(data) → no loading flash
                      └─ Not found? → listen for vertz:ssr-data event
                                        → resolve when server data arrives

Server (parallel):
  ├─ Receives GET /tasks/123 + X-Vertz-Nav: 1
  ├─ Runs SSR Pass 1: createApp() → queries register
  ├─ Promise.race(query, timeout) per query
  ├─ SSE: event: data  { key, data }     [fast queries]
  ├─ SSE: event: data  { key, data }     [slow queries, streamed later]
  └─ SSE: event: done                    [close connection]
```

## Protocol

**Request:**
```
GET /tasks/123
X-Vertz-Nav: 1
```

**Response (SSE):**
```
Content-Type: text/event-stream

event: data
data: {"key":"task-detail:abc","data":{"id":"abc","title":"Fix bug"}}

event: done
data: {}
```

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| Server slow (> timeout) | AbortController kills fetch. Queries fetch client-side. |
| Server error / network fail | `.catch()` silently swallows. Pure SPA fallback. |
| No queries on target page | Server sends `event: done`. No wasted work. |
| Rapid re-navigation | Previous pre-fetch aborted. Only latest matters. |
| Feature disabled | `prefetchNavData()` never called. SPA as today. |

**Fundamental guarantee:** Navigation never feels slower than pure client-side.

## Phase 1: Server-Side Nav Handler

### New file: `packages/ui-compiler/src/nav-handler.ts`

Handles `X-Vertz-Nav` requests in the Vite dev server. Runs Pass 1 of the SSR entry to discover and resolve queries, streams results as SSE.

Key function: `handleNavRequest(req, res, server, ssrOptions)`

1. Check `X-Vertz-Nav: 1` header — if absent, call `next()`
2. Invalidate SSR module tree (reuse existing invalidation logic from `configureServer`)
3. Load `\0vertz:ssr-entry` virtual module
4. Call a new `discoverQueries(url)` export that:
   - Sets `__SSR_URL__`, installs DOM shim, runs `ssrStorage.run()`
   - Calls `createApp()` (Pass 1 only — no Pass 2 render)
   - Awaits queries with `Promise.allSettled()` + per-query timeouts
   - Returns `{ resolved: [{key, data}], pending: [{key, promise}] }`
5. Write SSE response: `event: data` for each resolved query
6. Stream pending queries as they resolve
7. Write `event: done` and close

### Modified file: `packages/ui-compiler/src/vite-plugin.ts`

- Add `discoverQueries` export to `generateSSREntry()` — same SSR setup as `renderToString` but stops after Pass 1 query resolution (no Pass 2 render)
- In `configureServer()`, register the nav handler middleware **before** the existing SSR middleware
- Extract module invalidation into a shared helper (reuse between SSR middleware and nav handler)
- Add `serverNav?: boolean` to `SSROptions` (default: `true` when SSR is enabled)

### Tests: `packages/ui-compiler/src/__tests__/nav-handler.test.ts`

- `should include discoverQueries export in generated SSR entry` — codegen assertion
- `should skip non-nav requests` — mock req without header, verify `next()` called
- `should respond with SSE content type` — verify `text/event-stream` header
- `should stream resolved query data as SSE events` — mock SSR entry returning resolved queries
- `should send done event when complete` — verify `event: done` in response
- `should handle SSR errors gracefully` — verify `event: done` sent on error (client falls back)

**Acceptance:** Nav handler responds to `X-Vertz-Nav` requests with SSE events containing query data.

## Phase 2: Client-Side Pre-Fetch

### New file: `packages/ui/src/router/server-nav.ts`

Client-side module that fetches pre-rendered query data from the server and injects it into the hydration bus.

Key functions:

```ts
/** Re-create the SSR data bus (cleaned up after initial hydration). */
function ensureSSRDataBus(): void

/** Push data into the bus (triggers vertz:ssr-data CustomEvent). */
function pushNavData(key: string, data: unknown): void

/** Parse SSE events from a text buffer. */
function parseSSE(buffer: string): { events: Array<{type: string, data: string}>, remaining: string }

/** Start pre-fetching query data for a navigation target. Returns abort handle. */
export function prefetchNavData(url: string, options?: { timeout?: number }): { abort: () => void }
```

`ensureSSRDataBus()` re-creates `window.__VERTZ_SSR_DATA__` and `window.__VERTZ_SSR_PUSH__` — the same globals that the initial SSR hydration uses. `hydrateQueryFromSSR()` in `query.ts` already checks these globals and listens for `vertz:ssr-data` events.

### Modified file: `packages/ui/src/query/query.ts`

Small change to the client-side SSR hydration block (line ~192). When `__VERTZ_NAV_PREFETCH_ACTIVE__` is set, `query()` defers its client-side fetch and listens for the `vertz:nav-prefetch-done` event before falling back:

```ts
// After hydrateQueryFromSSR check:
if (!ssrHydrated && isNavPrefetchActive()) {
  // Don't start client fetch yet — wait for SSE to finish
  const doneHandler = () => {
    document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
    // If still no data, the effect will re-run and fetch client-side
    if (data.peek() === undefined) {
      refetchTrigger.value = refetchTrigger.peek() + 1;
    }
  };
  document.addEventListener('vertz:nav-prefetch-done', doneHandler);
  ssrHydrationCleanup = () => document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
  return; // skip client-side fetch for now
}
```

### Tests: `packages/ui/src/router/__tests__/server-nav.test.ts`

- `ensureSSRDataBus creates globals` — verify `__VERTZ_SSR_DATA__` and `__VERTZ_SSR_PUSH__` are created
- `pushNavData dispatches vertz:ssr-data event` — verify event listener receives data
- `parseSSE parses single event` — basic SSE parsing
- `parseSSE handles partial buffer` — incomplete event returns remaining buffer
- `prefetchNavData sends X-Vertz-Nav header` — mock fetch, verify headers
- `prefetchNavData pushes received data into bus` — mock SSE response, verify data in buffer
- `prefetchNavData abort cancels fetch` — verify AbortController.abort() called
- `prefetchNavData sets/clears __VERTZ_NAV_PREFETCH_ACTIVE__` — lifecycle test
- `data pushed before query mount is found in buffer` — integration with `hydrateQueryFromSSR()`
- `data pushed after query mount is received via event` — integration with event listener
- `query defers client fetch while prefetch active` — verify no client fetch until `done`
- `query falls back to client fetch after prefetch done with no data` — verify fallback

**Acceptance:** `prefetchNavData()` fetches SSE from server, injects data into hydration bus. Queries defer client-side fetches while SSE is active. No double fetches.

## Phase 3: Router Integration

### Modified file: `packages/ui/src/router/navigate.ts`

Add `serverNav` option to `createRouter()`:

```ts
export interface RouterOptions {
  /** Enable server-assisted navigation pre-fetching. */
  serverNav?: boolean | { timeout?: number };
}

export function createRouter<T>(..., options?: RouterOptions): Router<T> {
  // ...
  let activeNavPrefetch: { abort: () => void } | null = null;

  async function navigate(url, opts?) {
    // Abort previous pre-fetch
    activeNavPrefetch?.abort();
    activeNavPrefetch = null;

    // Start server pre-fetch IN PARALLEL (non-blocking)
    if (serverNavConfig && !isSSR) {
      activeNavPrefetch = prefetchNavData(url, serverNavConfig);
    }

    // Existing navigation logic (unchanged)
    if (!isSSR) { history.pushState(...); }
    await applyNavigation(url);
  }
}
```

Also abort active pre-fetch in `dispose()`.

### Modified file: `packages/ui/src/index.ts`

Export new `RouterOptions` type.

### Tests: `packages/ui/src/router/__tests__/navigate.test.ts`

- `navigate() calls prefetchNavData when serverNav enabled` — mock prefetchNavData, verify called
- `navigate() does not call prefetchNavData when serverNav disabled` — verify not called
- `navigate() aborts previous prefetch on rapid navigation` — verify abort called on second navigate
- `dispose() aborts active prefetch` — verify cleanup

**Acceptance:** Router calls `prefetchNavData()` before `applyNavigation()` when `serverNav` is enabled. Navigation is never blocked.

## Phase 4: Link Hover Prefetch (Enhancement)

### Modified file: `packages/ui/src/router/link.ts`

Add optional `prefetch: 'hover'` prop to `LinkProps`. When set, starts `prefetchNavData()` on `mouseenter`/`focus`:

```ts
export function createLink(
  currentPath, navigate,
  options?: { onPrefetch?: (url: string) => void }
)
```

The router passes its `prefetchNavData` as `onPrefetch` when creating the Link factory.

### Tests: `packages/ui/src/router/__tests__/link.test.ts`

- `fires onPrefetch on mouseenter when prefetch='hover'` — simulate mouseenter, verify callback
- `fires onPrefetch on focus when prefetch='hover'` — simulate focus, verify callback
- `does not fire onPrefetch without prefetch prop` — verify no callback
- `only fires onPrefetch once per link` — verify dedup (mouseenter then focus = 1 call)

**Acceptance:** Hovering/focusing a Link with `prefetch='hover'` starts the server pre-fetch early.

## Phase 5: End-to-End Verification

1. Rebuild `@vertz/ui` and `@vertz/ui-compiler`
2. Start task-manager dev server with SSR enabled
3. Playwright tests:
   - Load `/tasks/:id` (SSR) → click "All Tasks" link → verify NO loading flash on list page
   - Load `/` (SSR) → click task card → verify NO loading flash on detail page
   - Rapid navigation (click link, immediately click another) → verify no errors
   - Disable server (or network error) → verify graceful fallback to client-side fetching
4. Network tab verification: SSE request visible with `X-Vertz-Nav` header and `text/event-stream` response

## What Does NOT Change

- `packages/ui/src/query/ssr-hydration.ts` — existing buffer + event mechanism works as-is
- `packages/ui-server/src/ssr-streaming-runtime.ts` — `safeSerialize()` reused
- `packages/ui-server/src/ssr-context.ts` — `ssrStorage`, `getSSRQueries()` reused
- `packages/ui/src/router/router-view.ts` — unchanged, renders pages as today
- Production SSR (`renderToHTMLStream`) — unaffected

**Small change needed:** `packages/ui/src/query/query.ts` — add awareness of `__VERTZ_NAV_PREFETCH_ACTIVE__` to defer client-side fetch while SSE is in-flight (prevents double fetches).

## Risks

1. **Module invalidation cost:** Each nav request invalidates the SSR module tree. For rapid navigations this could be expensive. Mitigation: abort previous requests, and the invalidation is already done for initial page loads.

2. **SSR entry re-execution:** `createApp()` runs the full component tree for query discovery. If the app has expensive synchronous setup, this adds latency. Mitigation: the threshold timeout caps the wait time.

3. **`__VERTZ_SSR_DATA__` lifecycle:** Re-creating the bus on each navigation means stale data from previous navigations could linger. Mitigation: `ensureSSRDataBus()` clears the buffer before re-creating.

## Key Files

| File | Change |
|------|--------|
| `packages/ui-compiler/src/vite-plugin.ts` | Nav handler middleware + `discoverQueries` in SSR entry |
| `packages/ui-compiler/src/nav-handler.ts` | **New** — server-side nav request handler |
| `packages/ui/src/router/server-nav.ts` | **New** — client-side pre-fetch + SSR bus management |
| `packages/ui/src/router/navigate.ts` | Add `RouterOptions.serverNav`, call `prefetchNavData()` |
| `packages/ui/src/router/link.ts` | Add `prefetch: 'hover'` prop + `onPrefetch` callback |
| `packages/ui/src/query/query.ts` | Defer client fetch while nav pre-fetch is active |
| `packages/ui/src/index.ts` | Export `RouterOptions` type |

## Manifesto Alignment

- **Explicit over implicit:** Server nav is opt-in via `serverNav: true`. The loading state behavior is the same — pages that show loading states still show them, they just resolve faster.
- **One way to do things:** Queries work the same way regardless of how data arrives (SSR, cache, server nav, client fetch). The hydration bus is the single data injection point.
- **Production-ready by default:** Graceful degradation ensures no breakage if the server is unavailable.

## Future Optimizations

### Static Query Graph Analysis (Build-Time)

During the build, the compiler could statically analyze route components to extract their `query()` calls and build a route-to-queries dependency graph. This would let the server skip running `createApp()` entirely — it would know upfront which queries to fetch for a given route.

**Limitation:** This only works for static queries (fixed keys, no conditional rendering). Queries that depend on runtime state (user session, dynamic params, conditional components) can't be statically determined. The runtime `createApp()` approach remains the fallback for these cases.

**When to explore:** After the runtime approach is shipped and proven. Static analysis is a performance optimization, not a correctness requirement.
