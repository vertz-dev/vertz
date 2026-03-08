# SSR Per-Request Isolation via Dependency Inversion

**Issue:** [#1009](https://github.com/vertz-dev/vertz/issues/1009)

## Context

The SSR pipeline uses 15 module-level singletons in `@vertz/ui` shared across all requests. A render lock (mutex) serializes renders to prevent cross-request contamination. This limits SSR throughput and is fragile — any code outside the lock races on shared state.

**Decision:** Dependency inversion. `@vertz/ui` defines the interface and resolver registration point. `@vertz/ui-server` provides the `AsyncLocalStorage`-backed implementation. No new packages. No `globalThis` hacks.

---

## Architecture

### The resolver pattern

```
@vertz/ui                              @vertz/ui-server
┌─────────────────────────┐            ┌──────────────────────────────┐
│ SSRRenderContext (type)  │            │ AsyncLocalStorage<Context>   │
│ _ssrResolver (let)       │◄───────── │ registerSSRResolver(fn)      │
│ getSSRContext() → ctx    │            │   resolver = () => als.get()│
│                          │            │                              │
│ getAdapter() {           │            │ ssrRender() {                │
│   ctx = getSSRContext()  │            │   als.run(freshCtx, () => { │
│   if (ctx) return ctx... │            │     renderApp()              │
│   return moduleDefault   │            │   })                         │
│ }                        │            │ }                            │
└─────────────────────────┘            └──────────────────────────────┘
```

### SSRRenderContext type (lives in `@vertz/ui`)

```ts
export interface SSRRenderContext {
  // SSR metadata (replaces __SSR_URL__, existing ssrStorage fields)
  url: string;
  queries: SSRQueryEntry[];
  errors: unknown[];
  globalSSRTimeout?: number;

  // Rendering (replaces currentAdapter)
  adapter: RenderAdapter;

  // Context (replaces currentScope)
  contextScope: ContextScope | null;

  // Reactive tracking (replaces currentSubscriber, readValueCallback)
  subscriber: Subscriber | null;
  readValueCb: ((value: unknown) => void) | null;

  // Disposal (replaces cleanupStack)
  cleanupStack: DisposeFn[][];

  // Scheduler (replaces batchDepth, pendingEffects)
  batchDepth: number;
  pendingEffects: Map<number, Subscriber>;

  // Stores (replaces singletons)
  entityStore: EntityStore;
  envelopeStore: QueryEnvelopeStore;
  mutationEventBus: MutationEventBus;

  // Query cache (replaces defaultCache, inflight)
  queryCache: MemoryCache<unknown>;
  inflight: Map<string, Promise<unknown>>;
}
```

### Registration API (exported from `@vertz/ui/internals`)

```ts
// packages/ui/src/ssr/ssr-render-context.ts
type SSRContextResolver = () => SSRRenderContext | undefined;
let _ssrResolver: SSRContextResolver | null = null;

export function registerSSRResolver(resolver: SSRContextResolver): void {
  _ssrResolver = resolver;
}

export function getSSRContext(): SSRRenderContext | undefined {
  return _ssrResolver?.();
}
```

### How each singleton changes

Every getter: "check SSR context first, fall back to module-level."

```ts
// Before (adapter.ts)
export function getAdapter(): RenderAdapter {
  if (!currentAdapter) currentAdapter = createDOMAdapter();
  return currentAdapter;
}

// After
import { getSSRContext } from '../ssr/ssr-render-context';

export function getAdapter(): RenderAdapter {
  const ctx = getSSRContext();
  if (ctx) return ctx.adapter;
  if (!currentAdapter) currentAdapter = createDOMAdapter();
  return currentAdapter;
}
```

Same 2-line addition pattern for all other singletons. For read/write pairs (tracking, context scope, scheduler), both getter and setter check the context:

```ts
// tracking.ts — setSubscriber
export function setSubscriber(sub: Subscriber | null): Subscriber | null {
  const ctx = getSSRContext();
  if (ctx) {
    const prev = ctx.subscriber;
    ctx.subscriber = sub;
    return prev;
  }
  const prev = currentSubscriber;
  currentSubscriber = sub;
  return prev;
}
```

### What stays shared (not isolated)

- **`injectedCSS` Set** — append-only, idempotent. Module-level `css()` calls run once.
- **`nextId` counter** — monotonic, just needs uniqueness.
- **`contextRegistry`** — HMR identity, not relevant to SSR.
- **`signalCollectorStack`** — Fast Refresh only, `fastRefresh: false` in SSR.
- **Context `_stack` arrays** — per-context-object stacks used by Provider push/pop. Safe because `createApp()` is fully synchronous (push/pop always balanced within a single call frame) and JavaScript is single-threaded (two synchronous renders cannot interleave).

### Design invariant: synchronous tree construction

`createApp()` (tree construction) MUST remain fully synchronous. The Context `_stack` is shared across requests and relies on balanced push/pop within a single synchronous call frame. JavaScript's single-threaded execution guarantees that two synchronous `createApp()` calls cannot interleave. If tree construction ever becomes async (e.g., async component factories during tree walk), `_stack` would need per-request isolation.

### Sync fallback (Workers without `nodejs_compat`)

Same DI interface, different resolver. Uses a module-level variable + render lock (current behavior, just cleaner):

```ts
let syncCtx: SSRRenderContext | undefined;
registerSSRResolver(() => syncCtx);

function runWithSyncContext<T>(ctx: SSRRenderContext, fn: () => T): T {
  syncCtx = ctx;
  try { return fn(); }
  finally { syncCtx = undefined; }
}
```

**Note:** The sync fallback serializes SSR renders (identical throughput to the current mutex). Concurrent SSR requires `AsyncLocalStorage`, available in:
- Bun (native)
- Node.js (native, since v16)
- Cloudflare Workers (with `nodejs_compat` compatibility flag)

When TC39 `AsyncContext` ships, swap to that — zero changes to `@vertz/ui`.

---

## What gets eliminated

| Before | After |
|--------|-------|
| `globalThis.__VERTZ_CLEAR_QUERY_CACHE__` | Fresh per-request `queryCache` |
| `globalThis.__VERTZ_CLEAR_ENTITY_STORE__` | Fresh per-request `entityStore` |
| `globalThis.__VERTZ_CLEAR_MUTATION_EVENT_BUS__` | Fresh per-request `mutationEventBus` |
| `globalThis.__SSR_URL__` | `ctx.url` |
| `globalThis.__VERTZ_IS_SSR__` | `getSSRContext() !== undefined` |
| `globalThis.__VERTZ_SSR_REGISTER_QUERY__` | `getSSRContext()?.queries.push(...)` |
| `globalThis.__VERTZ_GET_GLOBAL_SSR_TIMEOUT__` | `getSSRContext()?.globalSSRTimeout` |
| `globalThis.__VERTZ_SSR_SYNC_ROUTER__` | Router reads `ctx.url` + computes match lazily |
| `withRenderLock()` mutex | Per-request isolation (no lock) |
| `installDomShim()` / `removeDomShim()` | Per-request adapter |
| `resetEntityStore()` | Not needed |
| `resetMutationEventBus()` | Not needed |
| `clearDefaultQueryCache()` | Not needed |
| `globalThis.fetch` patching | Separate `AsyncLocalStorage<typeof fetch>` in `@vertz/ui-server` |

---

## Phases

### Phase 1: DI infrastructure + adapter migration

**Goal:** Establish the resolver pattern, prove it with `getAdapter()`.

**New files:**
- `packages/ui/src/ssr/ssr-render-context.ts` — `SSRRenderContext` type, `registerSSRResolver`, `getSSRContext`

**Modified files:**
- `packages/ui/src/internals.ts` — export `registerSSRResolver`, `getSSRContext`, `SSRRenderContext` type
- `packages/ui/src/dom/adapter.ts` — `getAdapter()` checks `getSSRContext()?.adapter`
- `packages/ui-server/src/ssr-context.ts` — extend `AsyncLocalStorage` to hold `SSRRenderContext`, call `registerSSRResolver`
- `packages/ui-server/src/ssr-render.ts` — create per-request context with `adapter: createSSRAdapter()` in `ssrStorage.run()`

**Tests:**
- `getSSRContext()` returns `undefined` with no resolver
- `getSSRContext()` returns `undefined` outside `ssrStorage.run()`
- `getSSRContext()` returns context inside `ssrStorage.run()`
- `getAdapter()` returns SSR adapter inside context, DOM adapter outside
- Two concurrent SSR renders get different adapter instances
- Existing SSR tests pass

---

### Phase 2: Migrate reactive runtime state

**Goal:** Move `currentSubscriber`, `readValueCallback`, `cleanupStack`, `batchDepth`, `pendingEffects`.

**Modified files:**
- `packages/ui/src/runtime/tracking.ts` — get/set subscriber and readValueCallback check `getSSRContext()`
- `packages/ui/src/runtime/disposal.ts` — pushScope/popScope/onCleanup use `getSSRContext()?.cleanupStack`
- `packages/ui/src/runtime/scheduler.ts` — batch/scheduleNotify use `getSSRContext()` for depth/effects
- `packages/ui-server/src/ssr-context.ts` — populate these fields in context factory

**Tests:**
- Concurrent renders don't corrupt subscriber tracking
- Cleanup scopes isolated per request
- Effects from one render don't leak to another
- `untrack()` works inside SSR context

---

### Phase 3: Migrate context scope + store singletons + query cache

**Goal:** Move `currentScope`, `EntityStore`, `QueryEnvelopeStore`, `MutationEventBus`, `defaultCache`, `inflight`.

**Modified files:**
- `packages/ui/src/component/context.ts` — getContextScope/setContextScope use `getSSRContext()`
- `packages/ui/src/store/entity-store-singleton.ts` — getEntityStore/getQueryEnvelopeStore check context
- `packages/ui/src/store/mutation-event-bus-singleton.ts` — getMutationEventBus checks context
- `packages/ui/src/query/query.ts` — cache/inflight access via context or module default

**Tests:**
- Provider values don't leak across requests
- Entity store data isolated per request
- Query cache isolated per request
- Mutation bus isolated per request

---

### Phase 4: Consolidate SSR detection + remove hooks + router isolation

**Goal:** Replace all `globalThis.__VERTZ_*` hooks with `getSSRContext()`. Remove clear hooks and reset functions. Make routers SSR-context-aware to eliminate shared signal corruption.

**Router isolation (critical for Phase 5 correctness):**

Module-level `createRouter()` creates shared signals (`current`, `searchParams`). Without isolation, concurrent SSR renders would corrupt each other's router state via `__VERTZ_SSR_SYNC_ROUTER__`.

Fix: In SSR, `createRouter()` computes its route match lazily from `getSSRContext()?.url` instead of storing it in shared signals. `__VERTZ_SSR_SYNC_ROUTER__` is removed entirely.

```ts
// navigate.ts — SSR path in createRouter()
const ctx = getSSRContext();
if (ctx) {
  // Compute match from the per-request URL, not from shared signals
  const match = matchRoute(routes, ctx.url);
  return {
    current: { value: match, peek: () => match },
    searchParams: { value: match?.search ?? {}, peek: () => match?.search ?? {} },
    loaderData: { value: [], peek: () => [] },
    loaderError: { value: null, peek: () => null },
    navigate: () => Promise.resolve(), // no-op in SSR
    revalidate: () => Promise.resolve(),
    dispose: () => {},
  } as Router<T>;
}
```

This eliminates the need for router state on `SSRRenderContext` — the router reads `ctx.url` and computes the match on the fly. No new fields needed.

**Modified files:**
- `packages/ui/src/runtime/signal.ts` — `isSSR()` → `getSSRContext() !== undefined`
- `packages/ui/src/component/lifecycle.ts` — same
- `packages/ui/src/query/query.ts` — replace `__VERTZ_SSR_REGISTER_QUERY__` with `ctx.queries.push()`
- `packages/ui/src/css/css.ts` — replace `__SSR_URL__` check with `getSSRContext()` check
- `packages/ui/src/router/navigate.ts` — in SSR, return lightweight read-only router from `ctx.url`; remove `__VERTZ_SSR_SYNC_ROUTER__` registration
- `packages/ui/src/store/entity-store-singleton.ts` — remove `resetEntityStore`, `__VERTZ_CLEAR_ENTITY_STORE__`
- `packages/ui/src/store/mutation-event-bus-singleton.ts` — remove `resetMutationEventBus`, `__VERTZ_CLEAR_MUTATION_EVENT_BUS__`
- `packages/ui/src/query/query.ts` — remove `clearDefaultQueryCache`, `__VERTZ_CLEAR_QUERY_CACHE__`
- `packages/ui-server/src/ssr-render.ts` — remove all `__VERTZ_CLEAR_*` calls, `__SSR_URL__` set/delete, remove `__VERTZ_SSR_SYNC_ROUTER__` call
- `packages/ui-server/src/ssr-context.ts` — remove `__VERTZ_IS_SSR__`, `__VERTZ_SSR_REGISTER_QUERY__`, `__VERTZ_GET_GLOBAL_SSR_TIMEOUT__`

**Tests:**
- No `__VERTZ_*` hooks on globalThis (except `__VERTZ_CTX_REG__` for HMR)
- Router reads URL from SSR context
- Two concurrent SSR renders with different URLs get correct `useRouter().current` values
- Router does NOT register `__VERTZ_SSR_SYNC_ROUTER__` when in SSR context
- All existing SSR tests pass

---

### Phase 5: Remove render lock + DOM shim

**Goal:** Remove `withRenderLock`. Remove `installDomShim()`/`removeDomShim()` from render path.

**Prerequisites:** Audit `@vertz/ui` for any `document`/`window` references that bypass `getAdapter()`. `css.ts` already guards with `typeof document === 'undefined'`. `collectCSS()` primary path uses `module.getInjectedCSS()`.

**Modified files:**
- `packages/ui-server/src/ssr-render.ts` — remove `renderLock`, `withRenderLock`, `installDomShim()`/`removeDomShim()`
- `packages/ui-server/src/ssr-render.ts` — update `collectCSS()` to not rely on DOM shim fallback

**Tests:**
- 10 concurrent `ssrRenderToString` calls with different URLs → correct isolated output
- `ssrStreamNavQueries` works correctly with concurrent requests
- No DOM shim globals set during render
- Throughput measurement: concurrent vs serial

---

### Phase 6: Fetch interception + sync fallback + cleanup

**Goal:** Replace `globalThis.fetch` patching. Add sync fallback. Performance validation.

**Fetch interception design:** `fetchInterceptor` does NOT go on `SSRRenderContext` — that would couple `@vertz/ui` to fetch concerns. Instead, `@vertz/ui-server` uses its own `AsyncLocalStorage<typeof fetch>` to scope fetch interception per request:

```ts
// packages/ui-server/src/fetch-scope.ts (new)
import { AsyncLocalStorage } from 'node:async_hooks';

const fetchScope = new AsyncLocalStorage<typeof fetch>();

export function runWithScopedFetch<T>(interceptor: typeof fetch, fn: () => T): T {
  return fetchScope.run(interceptor, fn);
}

export function installFetchProxy(): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const scoped = fetchScope.getStore();
    if (scoped) return scoped(input, init);
    return originalFetch(input, init);
  };
}
```

**New files:**
- `packages/ui-server/src/fetch-scope.ts` — per-request fetch scoping via separate AsyncLocalStorage

**Modified files:**
- `packages/ui-server/src/bun-dev-server.ts` — wrap SSR render in `runWithScopedFetch(interceptor, () => ...)`
- `packages/cloudflare/src/handler.ts` — same
- `packages/ui-server/src/ssr-context-sync.ts` (new) — sync fallback resolver

**Tests:**
- Concurrent requests route through correct fetch interceptor
- No `globalThis.fetch` mutation during SSR render
- Sync fallback works with render lock
- Benchmark: `getSSRContext()` overhead in hot paths (getAdapter, getSubscriber, onCleanup)
- Stress test: 50 concurrent SSR renders → all correct

---

## Key files

| File | Role |
|------|------|
| `packages/ui/src/ssr/ssr-render-context.ts` | NEW — type + resolver |
| `packages/ui/src/internals.ts` | Export resolver API |
| `packages/ui/src/dom/adapter.ts` | Singleton → context-aware |
| `packages/ui/src/component/context.ts` | Singleton → context-aware |
| `packages/ui/src/runtime/tracking.ts` | Singleton → context-aware |
| `packages/ui/src/runtime/disposal.ts` | Singleton → context-aware |
| `packages/ui/src/runtime/scheduler.ts` | Singleton → context-aware |
| `packages/ui/src/store/entity-store-singleton.ts` | Singleton → context-aware, remove reset |
| `packages/ui/src/store/mutation-event-bus-singleton.ts` | Singleton → context-aware, remove reset |
| `packages/ui/src/query/query.ts` | Cache → context-aware, remove hooks |
| `packages/ui/src/router/navigate.ts` | SSR-aware router, remove `__VERTZ_SSR_SYNC_ROUTER__` |
| `packages/ui-server/src/ssr-context.ts` | AsyncLocalStorage provider |
| `packages/ui-server/src/ssr-render.ts` | Remove mutex, hooks, DOM shim |
| `packages/ui-server/src/fetch-scope.ts` | NEW — per-request fetch scoping |

## Verification

After each phase:
```bash
bun test packages/ui/ packages/ui-server/
turbo run typecheck --filter @vertz/ui --filter @vertz/ui-server
bunx biome check --write packages/ui/src/ packages/ui-server/src/
```

After all phases:
```bash
bun test
turbo run typecheck
bun run lint
cd examples/task-manager && npx playwright test
```
