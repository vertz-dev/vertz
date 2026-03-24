# Reactive Search Params (`useSearchParams()`) — Rev 3

## Problem

Components that read URL search params must access raw `URLSearchParams` and manually parse values:

```tsx
function SearchPage() {
  const router = useRouter();
  const sp = router.current?.searchParams;
  const q = sp?.get('q') || '';
  const page = Number(sp?.get('page') || '1');
  // ... manual parsing, no reactivity on individual params, no URL sync on write
}
```

Routes already support `searchParams: schema` for typed parsing, but there's no hook that:
1. Returns a **typed, reactive object** (not raw URLSearchParams)
2. Leverages the route's schema for parsing
3. **Writes back to the URL** when properties change

## API Surface

### Route definition (unchanged)

`@vertz/schema` objects satisfy `SearchParamSchema<T>` directly — their `parse()` returns the same `{ ok, data }` result shape. Use `s.coerce.*` for search params since raw values arrive as strings from the URL:

```tsx
import { s } from '@vertz/schema';

const searchSchema = s.object({
  q: s.string().default(''),
  page: s.coerce.number().default(1),
  sort: s.enum(['relevance', 'date', 'price']).default('relevance'),
});

const routes = defineRoutes({
  '/search': {
    component: SearchPage,
    searchParams: searchSchema,
  },
});
```

### Reading search params (reactive)

```tsx
function SearchPage() {
  const sp = useSearchParams();
  // sp.q, sp.page, sp.sort — typed, reactive

  const results = query(
    () => fetchSearch({ q: sp.q, page: sp.page, sort: sp.sort }),
    { key: () => `search-${sp.q}-${sp.page}-${sp.sort}` },
    //     ^^^^ key is a function — re-evaluated reactively when params change
  );

  return (
    <div>
      {/* Auto-unwrapped in JSX — compiler wraps in getter */}
      <p>Showing results for "{sp.q}" (page {sp.page})</p>
      <ResultList items={results.data} />
    </div>
  );
}
```

### Writing search params (updates URL)

```tsx
function SearchPage() {
  const sp = useSearchParams();

  function handleSearch(e: Event) {
    sp.q = (e.target as HTMLInputElement).value;
    // URL becomes /search?q=<new-value>&page=1&sort=relevance
    // No manual router.navigate() needed
  }

  function nextPage() {
    sp.page = sp.page + 1;
    // URL becomes /search?q=dragon&page=2&sort=relevance
    // Read-after-write is consistent: sp.page immediately returns 2
  }

  return (
    <div>
      <input value={sp.q} onInput={handleSearch} />
      <button onClick={nextPage}>Next page</button>
    </div>
  );
}
```

### Removing search params

Setting a param to `undefined` or `null` removes it from the URL. `delete` also works:

```tsx
function clearFilter() {
  sp.q = undefined;    // removes ?q= from URL
  // or: sp.q = null;  // same effect
  // or: delete sp.q;  // same effect (Proxy deleteProperty trap)
}
```

This aligns with `buildSearch()` behavior (lines 173-179 of `navigate.ts`) which already skips `null`/`undefined` values.

### Batch updates

Multiple property changes in the same synchronous tick are batched into a single navigation:

```tsx
function resetSearch() {
  sp.q = '';
  sp.page = 1;
  sp.sort = 'relevance';
  // Single navigation: /search?page=1&q=&sort=relevance
}
```

### Navigate with options (push history entry)

For cases where param changes should create a history entry (pagination, faceted search), use `sp.navigate()`:

```tsx
function goToPage(page: number) {
  sp.navigate({ page }, { push: true });
  // Creates a history entry — back button returns to previous page
}

// Equivalent to:
const { navigate } = useRouter();
navigate({ to: window.location.pathname, search: { ...currentParams, page }, replace: false });
```

`sp.navigate(partial, options?)` merges the partial object with current params and navigates. `navigate` is a reserved method name on the search params proxy — it cannot be used as a search param key (this is an acceptable tradeoff given how unlikely the collision is).

### Type inference

Type inference follows the same pattern as `useParams<'/tasks/:id'>()` — pass the route path as a generic and the search param type is extracted from the route definition:

```tsx
// Route path generic — type comes from the route's searchParams schema
const sp = useSearchParams<'/search'>();
// sp.q: string, sp.page: number, sp.sort: 'relevance' | 'date' | 'price'

// With codegen (after `vertz generate` runs), no generic needed:
const sp = useSearchParams();
// Augmented via .vertz/generated/router.d.ts — same pattern as useRouter()
```

Type errors on assignment:

```tsx
// @ts-expect-error — page is number, assigning string is a type error
sp.page = 'not-a-number';

// @ts-expect-error — 'unknown' is not in the sort union
sp.sort = 'unknown';
```

**How it works**: `defineRoutes<const T>()` captures the route map as a literal type. The `SearchParamSchema<T>` on each route config preserves `T`. A type utility `ExtractSearchParams<TPath, TRouteMap>` looks up the route's schema output type:

```ts
// Type utility (parallel to ExtractParams for path params)
type ExtractSearchParams<
  TPath extends string,
  TMap extends Record<string, RouteConfigLike> = RouteDefinitionMap,
> = TPath extends keyof TMap
  ? TMap[TPath] extends { searchParams: SearchParamSchema<infer T> }
    ? T
    : Record<string, string>
  : Record<string, string>;
```

### Fallback (no schema / no generic)

When no generic is provided and the matched route has no schema, returns `Record<string, string>`:

```tsx
function GenericPage() {
  const sp = useSearchParams(); // Record<string, string>
  const tab = sp.tab; // string | undefined
  sp.tab = 'settings'; // URL updates
}
```

### Overload summary

```tsx
// 1. Route path generic — infers search param type from route definition
function useSearchParams<TPath extends string>(): ReactiveSearchParams<ExtractSearchParams<TPath>>;

// 2. Explicit type — for cases where route path inference isn't available
function useSearchParams<T extends Record<string, unknown>>(): ReactiveSearchParams<T>;

// 3. No generic — returns Record<string, string> (raw params) or codegen-augmented type
function useSearchParams(): ReactiveSearchParams<Record<string, string>>;

// 4. With signal (deprecated — use standalone overload instead)
// Kept for backward compatibility, will be removed in v0.2.x
function useSearchParams<T>(searchSignal: ReadonlySignal<T>): T;
```

This mirrors how `useParams` works:
- `useParams<'/tasks/:id'>()` → `{ id: string }` (from path)
- `useParams<{ id: number }>()` → `{ id: number }` (explicit)
- `useSearchParams<'/search'>()` → `{ q: string; page: number; sort: ... }` (from route schema)
- `useSearchParams<SearchType>()` → `SearchType` (explicit)

**Breaking change**: The zero-arg `useSearchParams()` previously returned `URLSearchParams`. It now returns a `ReactiveSearchParams` proxy. Components using `.get()`, `.entries()`, etc. must switch to direct property access (`sp.q` instead of `sp.get('q')`). This is pre-v1, breaking changes are encouraged per policy.

## Implementation Strategy

### Runtime: Proxy-based reactive object

The central challenge: `useContext(RouterContext)` returns a router wrapped by `wrapSignalProps()`, where `router.searchParams` is already an auto-unwrapping getter (returns `Record<string, unknown>`, not a `Signal`). The Proxy needs the **raw Signal** to register reactive dependencies.

**Solution**: Create the `ReactiveSearchParams` proxy inside `createRouter()`, where the raw Signal is available. Store it on the router as `router._reactiveSearchParams`. The `useSearchParams()` hook retrieves it from the context.

```tsx
// Inside createRouter() — raw signal access
function createReactiveSearchParams(
  rawSearchParamsSignal: Signal<Record<string, unknown>>,
  navigateFn: Router['navigate'],
): ReactiveSearchParams {
  let pending: Record<string, unknown> | null = null;

  function flush() {
    if (!pending) return;
    // Filter out undefined/null to remove params
    const merged = { ...rawSearchParamsSignal.value };
    for (const [key, value] of Object.entries(pending)) {
      if (value === undefined || value === null) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    pending = null;
    navigateFn({ to: window.location.pathname, search: merged, replace: true });
  }

  return new Proxy({} as ReactiveSearchParams, {
    get(_target, key: string) {
      if (key === 'navigate') return navigateWithOptions; // reserved method
      if (key === Symbol.toPrimitive || key === 'toJSON') {
        return () => rawSearchParamsSignal.value;
      }
      // Check pending first for read-after-write consistency
      if (pending && key in pending) return pending[key];
      // Read from signal — triggers reactive dependency tracking
      return rawSearchParamsSignal.value[key];
    },
    set(_target, key: string, value: unknown) {
      if (!pending) {
        pending = {};
        queueMicrotask(flush);
      }
      pending[key] = value;
      return true;
    },
    deleteProperty(_target, key: string) {
      if (!pending) {
        pending = {};
        queueMicrotask(flush);
      }
      pending[key] = undefined;
      return true;
    },
    ownKeys() {
      const current = pending
        ? { ...rawSearchParamsSignal.value, ...pending }
        : rawSearchParamsSignal.value;
      return Object.keys(current).filter((k) => current[k] !== undefined);
    },
    getOwnPropertyDescriptor(_target, key: string) {
      const val = pending?.[key] ?? rawSearchParamsSignal.value[key];
      if (val === undefined) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: val };
    },
    has(_target, key: string) {
      if (pending && key in pending) return pending[key] !== undefined;
      return key in rawSearchParamsSignal.value;
    },
  });
}

// navigate() — batch with explicit push/replace option (reserved method)
function navigateWithOptions(partial: Record<string, unknown>, options?: { push?: boolean }) {
  const merged = { ...rawSearchParamsSignal.value, ...partial };
  // Filter nulls/undefineds
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined || merged[key] === null) delete merged[key];
  }
  navigateFn({
    to: window.location.pathname,
    search: merged,
    replace: !options?.push,
  });
}
```

Key decisions:
- **`replace: true` default**: Matches TanStack Router / Next.js. Explicit `push` via `sp.navigate(partial, { push: true })`.
- **Microtask batching**: Multiple property writes in the same tick → single navigation.
- **Read-after-write consistency**: `get` checks `pending` before reading the signal → `sp.page = 2; sp.page` returns `2`.
- **`ownKeys` / `has` / `getOwnPropertyDescriptor`**: Makes `{ ...sp }`, `Object.keys(sp)`, `JSON.stringify(sp)` work.
- **`deleteProperty`**: `delete sp.q` removes the param from the URL.
- **Equality check in flush**: Only navigate if merged params actually differ from current (avoids spurious navigate loops).

### Signal access architecture

```
createRouter()
  ├── _searchParams: Signal<Record<string, unknown>>     ← raw signal
  ├── searchParams: { get value() { ... } }              ← SSR-aware proxy (existing)
  └── _reactiveSearchParams: ReactiveSearchParams         ← NEW: Proxy over _searchParams

RouterContext.Provider(router, ...)
  └── wrapSignalProps(router)                             ← unwraps signals for useRouter()

useSearchParams()
  └── useContext(RouterContext)
      └── router._reactiveSearchParams                    ← Proxy, not wrapped by wrapSignalProps
          └── get trap reads _searchParams.value[key]     ← triggers reactive tracking
```

`wrapSignalProps` only wraps properties that have `.peek()` (Signal-like). The Proxy object doesn't have `.peek()`, so it passes through untouched. This means `useSearchParams()` can access `router._reactiveSearchParams` from the wrapped context and get the raw Proxy.

### SSR behavior

During SSR:
- The Proxy is **not created** — SSR uses a lightweight read-only router. `_reactiveSearchParams` returns a simple getter-based object that reads from the SSR context URL match.
- Reads: Re-derive from `matchRoute(routes, ctx.url)` per access (existing behavior).
- Writes: **Throw in dev mode** during SSR to surface the mistake early.

```tsx
// SSR variant
const ssrReactiveSearchParams = new Proxy({} as ReactiveSearchParams, {
  get(_target, key: string) {
    const match = matchRoute(routes, ctx.url);
    return match?.search?.[key];
  },
  set() {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'useSearchParams() writes are not supported during SSR. ' +
        'Use schema defaults for initial values.',
      );
    }
    return true;
  },
});
```

**Guidance for defaults**: Use `s.coerce.number().default(1)` etc. in the schema definition, not imperative writes in the component. This avoids SSR/client divergence.

### Compiler: Register in `reactivity.json`

The compiler's reactivity analyzer reads from `reactivity.json`, **not** from the `REACTIVE_SOURCE_APIS` set (which is not used by the analyzer). Add to `packages/ui/reactivity.json`:

```json
{
  "exports": {
    "useSearchParams": {
      "kind": "function",
      "reactivity": {
        "type": "reactive-source"
      }
    }
  }
}
```

This tells the compiler to wrap all property accesses on the return value in getter functions for JSX reactivity:

```tsx
// Input
<p>{sp.q}</p>

// Compiled
<p>{() => sp.q}</p>
```

Also update `REACTIVE_SOURCE_APIS` for consistency (even though the analyzer doesn't use it), since other parts of the codebase may reference it.

### Circular update prevention

When the Proxy's `flush()` calls `navigate()`, this eventually updates `_searchParams.value = match.search`. Since `matchRoute()` always returns a fresh object (even with identical values), this triggers reactive subscribers.

Prevention:
1. **Equality check in flush**: Before navigating, compare merged params with `_searchParams.value`. If deeply equal, skip.
2. **Signal write equality**: The `_searchParams` signal could use structural equality for notifications. But this is a broader change — for now, the flush equality check is sufficient.

## Manifesto Alignment

- **Principle 1 (Feels like plain JS)**: `sp.q` reads and `sp.q = 'new'` writes are plain property access. `delete sp.q` removes a param. `{ ...sp }` spreads params. No `.value`, no `.set()`, no dispatch.
- **Principle 2 (Compiler does the work)**: The compiler wraps reads in getters for JSX reactivity. The developer writes plain property access.
- **Principle 5 (SSR-first)**: Search params are available during SSR. Writes throw in dev mode (clear error) rather than silently failing.

## Non-Goals

- **URL encoding customization**: The existing `buildSearch()` handles serialization. No custom serializers per-param.
- **Array params** (e.g., `?tags=a&tags=b`): Partially supported on the write side (`buildSearch()` handles arrays), but the read side depends on the schema's `parse()` implementation. Not adding special Proxy handling — this is a schema concern. Documented as a known pattern for users who need it.
- **Debouncing**: Not built-in. Users wrap their handlers with their own debounce. The microtask batch handles synchronous batching only.
- **Changing `Router<T>` generics for search params**: Type inference uses `ExtractSearchParams` + codegen augmentation, not changes to the `Router` interface. `Router.searchParams` stays as `Signal<Record<string, unknown>>` at runtime.

## Unknowns

1. **Route path generic feasibility** — The `ExtractSearchParams<TPath, TRouteMap>` type utility needs the route map type at the `useSearchParams` call site. Two approaches:
   - **Type utility + default generic**: `useSearchParams<TPath>()` uses `RouteDefinitionMap` (a global type augmented by codegen) as the default route map. Same pattern as `useRouter()`.
   - **Codegen augmentation**: `.vertz/generated/router.d.ts` augments `useSearchParams()` to return the union of all route search param types, or the current route's type specifically.

   The codegen approach is proven (already works for `useRouter()`). The type utility approach is simpler but may not work if `RouteDefinitionMap` doesn't carry search param schema types at the type level.

   **Resolution**: Implement type utility first (Phase 2). If `defineRoutes<const T>()` preserves `SearchParamSchema<T>` on route configs (it should — `<const T>` captures literal types), the utility works. Codegen augmentation provides the zero-generic DX on top.

2. **Coarse-grained reactivity** — The Proxy reads `_searchParams.value`, which is one signal for all params. Changing `sp.page` re-notifies subscribers that only read `sp.q`. This is acceptable for v0 (search params typically have <10 keys), but per-key signals could be a future optimization. **Resolution**: Document as known limitation. Monitor real-world perf.

## Type Flow Map

```
defineRoutes<const T>({
  '/search': { searchParams: s.object({ q: s.string(), page: s.coerce.number() }) }
})
  ↓ <const T> preserves literal route keys AND schema types
  ↓ T['/search'].searchParams is typed as ObjectSchema<{ q: string; page: number }>
  ↓
TypedRoutes<T> (phantom __routes field carries T)
  ↓
RouteDefinitionMap (augmented by codegen in .vertz/generated/router.d.ts)
  ↓
ExtractSearchParams<'/search', RouteDefinitionMap>
  ↓ Looks up: TMap['/search'].searchParams extends SearchParamSchema<infer S> ? S : ...
  ↓ Result: { q: string; page: number }
  ↓
useSearchParams<'/search'>() → ReactiveSearchParams<{ q: string; page: number }>
  ↓
Component reads sp.q → string (typed)
Component reads sp.page → number (typed)
Component writes sp.page = 2 → batched navigate with serialized params

Runtime: Router.searchParams is Signal<Record<string, unknown>>.
Type safety is compile-time via ExtractSearchParams + codegen augmentation.
```

## E2E Acceptance Test

```tsx
describe('Feature: Reactive useSearchParams()', () => {
  describe('Given a route /search with searchParams schema { q: string, page: number }', () => {
    describe('When SSR renders /search?q=dragon&page=2', () => {
      it('Then useSearchParams().q returns "dragon"', () => {});
      it('Then useSearchParams().page returns 2 (number, not string)', () => {});
      it('Then the SSR HTML contains the search term', () => {});
    });

    describe('When the component sets sp.q = "phoenix"', () => {
      it('Then the URL updates to /search?page=2&q=phoenix (replace, not push)', () => {});
      it('Then reading sp.q immediately returns "phoenix" (read-after-write)', () => {});
      it('Then router.searchParams.value reflects the change after flush', () => {});
    });

    describe('When the component removes a param with sp.q = undefined', () => {
      it('Then the URL no longer contains the q param', () => {});
      it('Then sp.q returns undefined', () => {});
    });

    describe('When the component uses delete sp.q', () => {
      it('Then the q param is removed from the URL', () => {});
    });

    describe('When multiple params are set synchronously', () => {
      it('Then only one navigation occurs (microtask batching)', () => {});
      it('Then the URL reflects all changes', () => {});
    });

    describe('When sp.navigate({ page: 3 }, { push: true }) is called', () => {
      it('Then a history entry is created (push, not replace)', () => {});
      it('Then existing params are preserved (merged with current)', () => {});
    });
  });

  describe('Given a route without searchParams schema', () => {
    describe('When useSearchParams() is called on /items?sort=price', () => {
      it('Then returns Record<string, string> with sort="price"', () => {});
    });
  });

  describe('SSR safety', () => {
    describe('When a component writes to sp during SSR', () => {
      it('Then throws in dev mode with clear error message', () => {});
    });
  });

  describe('Introspection', () => {
    it('Then Object.keys(sp) returns current param names', () => {});
    it('Then { ...sp } creates a plain object copy', () => {});
    it('Then JSON.stringify(sp) serializes current params', () => {});
  });

  describe('Type safety (route path generic)', () => {
    it('Then useSearchParams<"/search">() infers types from the route schema', () => {
      const sp = useSearchParams<'/search'>();
      const q: string = sp.q; // typed as string
      const page: number = sp.page; // typed as number
    });

    it('Then assigning wrong type to a schema-typed param is a compile error', () => {
      const sp = useSearchParams<'/search'>();
      // @ts-expect-error — page is number, not string
      sp.page = 'not-a-number';
    });
  });
});
```

## Implementation Plan

### Phase 1: Runtime — Proxy-based `useSearchParams()` with batched writes

- Create `createReactiveSearchParams()` inside `createRouter()` (both browser and SSR variants)
- Store as `router._reactiveSearchParams` (not wrapped by `wrapSignalProps` — Proxy has no `.peek()`)
- Update `useSearchParams()` zero-arg overload to return the Proxy from context
- Implement: `get` (with pending check), `set`, `deleteProperty`, `ownKeys`, `has`, `getOwnPropertyDescriptor`
- Implement `navigate` reserved method on the Proxy for batch updates with push/replace option
- Microtask batching with equality check in flush
- SSR: read-only proxy, throws on write in dev mode
- Deprecate `useSearchParams(signal)` overload (keep working, add JSDoc `@deprecated`)
- Tests: read, write, read-after-write, batch, delete, spread, navigate, SSR throw

### Phase 2: Type inference — `ExtractSearchParams` + route path generic

- Create `ExtractSearchParams<TPath, TMap>` type utility (parallel to `ExtractParams`)
- Add overloads: `useSearchParams<'/search'>()` resolves via `ExtractSearchParams<TPath, RouteDefinitionMap>`
- Update codegen (`router-augmentation-generator.ts`) to augment `useSearchParams()` with the app's route types
- Type tests (`.test-d.ts`): route path inference, explicit generic, no-generic fallback, `@ts-expect-error` for wrong types

### Phase 3: Compiler — Register in `reactivity.json`

- Add `useSearchParams` entry with `"type": "reactive-source"` to `packages/ui/reactivity.json`
- Also add to `REACTIVE_SOURCE_APIS` set for consistency
- Compiler integration tests: JSX auto-unwrap for `sp.q`, `sp.page`
- Verify Proxy `get` trap fires correctly inside compiled getter functions

### Phase 4: Integration + docs

- E2E test: SSR render with search params → verify HTML
- Hydration test: SSR + client agree on rendered output
- Update `packages/docs/` with `useSearchParams()` guide
- Migration note: `URLSearchParams` → `ReactiveSearchParams` breaking change
