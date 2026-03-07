# Design Doc: Schema-Based Route Param Parsing and Typing

**Status:** Approved (post-adversarial review v2)
**Author:** mike
**Feature:** Route param schemas [#945]

---

## 1. API Surface

### 1.1 `ParamSchema<T>` — same interface as `SearchParamSchema<T>`

```ts
/** Schema interface for parsing and validating route path params. */
export interface ParamSchema<T> {
  parse(data: unknown): { ok: true; data: T } | { ok: false; error: unknown };
}
```

Intentionally identical to `SearchParamSchema<T>`. Any object with a conforming `parse()` method works — including future `d.object()` schemas from `@vertz/db`.

### 1.2 `RouteConfig` gains a `params` field

```tsx
import { defineRoutes } from '@vertz/ui';

const routes = defineRoutes({
  '/tasks/:id': {
    component: () => TaskDetailPage(),
    params: {
      parse(raw) {
        const { id } = raw as { id: string };
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) return { ok: false, error: `Invalid UUID: ${id}` };
        return { ok: true, data: { id } };
      },
    },
  },
  '/items/:id': {
    component: () => ItemDetailPage(),
    // No params schema — backward compat, raw string params
  },
});
```

The `params` field is optional. Routes without it behave exactly as today.

### 1.3 Parsing at the routing layer

When `matchRoute()` finds a matching route with a `params` schema, it runs `parse()` on the raw string params. **If parsing fails, `matchRoute()` returns `null`** — treating invalid params as "no match." This is the simplest integration: the existing fallback/404 mechanism handles it.

When parsing succeeds, the result is stored in `RouteMatch.parsedParams`:

```ts
export interface RouteMatch {
  params: Record<string, string>;           // Raw string params (always present)
  parsedParams?: Record<string, unknown>;   // Parsed via schema (set when schema succeeds)
  route: CompiledRoute;
  matched: MatchedRoute[];
  searchParams: URLSearchParams;
  search: Record<string, unknown>;
}
```

- Schema succeeds: `parsedParams` is set, match is returned
- Schema fails: `matchRoute()` returns `null` (no match)
- Schema `parse()` throws: caught, treated as failure → returns `null`
- No schema: `parsedParams` is undefined, match returned as before

**Design rationale for returning `null` on failure:**
The adversarial review (C2) revealed that `RouterView` has **zero existing error handling** — no `errorComponent` rendering for loader errors or anything else. Building `errorComponent` integration from scratch is significant scope. Returning `null` leverages the existing fallback mechanism: invalid params → no match → fallback/404 renders. Custom per-route error rendering for param failures is deferred to a follow-up.

### 1.4 `useParams()` — backward compatible with new overload

```ts
// Overload 1: path literal → string params (backward compat)
function useParams<TPath extends string = string>(): ExtractParams<TPath>;

// Overload 2: parsed type assertion → read parsed params
function useParams<T extends Record<string, unknown>>(): T;
```

**Backward compat** — existing code unchanged:
```tsx
const { id } = useParams<'/tasks/:id'>();
// id: string — works exactly as before
```

**New: parsed type assertion** — when route has a param schema:
```tsx
const { id } = useParams<{ id: string }>();
// id: string — reads parsedParams from RouteMatch
```

**Overload resolution:**
- `useParams<'/tasks/:id'>()` — `string` literal → overload 1 (extends `string`, not `Record`)
- `useParams<{ id: string }>()` — object type → overload 2 (extends `Record`, not `string`)
- `useParams()` — no type param → overload 1 default (`TPath = string`)

**Runtime behavior (shared by both overloads):**
```ts
function useParams(): unknown {
  const router = useContext(RouterContext);
  if (!router) throw new Error('useParams() must be called within RouterContext.Provider');
  const match = router.current;
  return match?.parsedParams ?? match?.params ?? {};
}
```

**Documented limitation:** If a developer uses `useParams<{ id: number }>()` on a route that has no `params` schema, the runtime returns `Record<string, string>` but the type says `{ id: number }`. This is an unsound type assertion — same trade-off as the existing `useParams<TPath>()` where passing the wrong path literal produces wrong types. The developer is responsible for matching the type parameter to the route's actual schema.

### 1.5 Nested routes — leaf schema only

For nested routes, only the **leaf route's** `params` schema is used. It receives ALL accumulated params from the full matched chain (parent + child segments). Parent route `params` schemas are ignored during the leaf match.

This matches how `searchParams` currently works: walks matched routes and uses the first schema found.

```tsx
defineRoutes({
  '/users/:userId': {
    component: () => UserLayout(),
    children: {
      '/posts/:postId': {
        component: () => PostDetailPage(),
        params: postSchema,  // Receives { userId, postId }
      },
    },
  },
});
```

### 1.6 Schema requirements

**Schemas must be pure functions.** `parse()` is called during every route match, including popstate (back/forward buttons) and SSR sync. Side effects (database calls, network requests) in `parse()` will execute on every navigation and must be avoided.

## 2. Manifesto Alignment

**Schema is the source of truth:** Extends the "define once, use everywhere" pattern from database tables and API entities to route params. The param schema is the single source of truth for validation.

**Compile-time over runtime:** Invalid params are caught at the routing layer before rendering. Combined with `useParams<TPath>()` type checking, both compile-time (type safety) and runtime (schema validation) enforce correctness.

**Explicit over implicit:** The param schema is explicitly attached to the route config. `useParams()` with a type parameter is an explicit developer assertion.

**One way to do things:** Same schema interface (`parse()` → `{ ok, data/error }`) for both path params and search params.

### Alternatives considered

**`useParams(schema)` runtime argument for type inference:** Passing the schema to `useParams` for type inference. Rejected: the schema argument would be unused at runtime (parsing already happened in `matchRoute`) — passing an argument that's ignored is misleading.

**Separate `useParsedParams<T>()` hook:** A new hook distinct from `useParams`. Rejected: introduces a second way to read params ("one way to do things" violation).

**`matchRoute` returns match with `paramError` field:** Adversarial review C2 revealed `RouterView` has no error handling at all. Adding `paramError` to `RouteMatch` and rendering `errorComponent` requires building error rendering in `RouterView` from scratch — significant scope. Deferred. Returning `null` from `matchRoute` on failure leverages the existing fallback mechanism.

**Passing parsed params to loaders:** Loaders currently receive `Record<string, string>`. Passing `Record<string, unknown>` (parsed params) creates a type lie (adversarial review I7). Deferred — loaders always receive raw string params.

## 3. Non-Goals

- **`RouterView` error component rendering for param failures** — `RouterView` has no existing error handling. Building it is a separate feature. Invalid params → `matchRoute` returns `null` → fallback renders.
- **Passing parsed params to loaders** — Loaders always receive raw string params. Developers who need parsed values in loaders can re-parse using the schema.
- **Automatic type inference for `useParams()`** — The parsed type is NOT inferred from the route definition. The developer provides a type parameter assertion.
- **Schema library integration** — This defines the `ParamSchema<T>` interface. Making `d.object()` conform to it is a separate task.
- **Search param error handling** — `searchParams` parse failures silently fall back to empty `search`. Unchanged.
- **Nested route param schema inheritance** — Only leaf route schemas run.

## 4. Unknowns

### 4.1 `CompiledRoute` params storage — **Resolved (discussion)**

`CompiledRoute` already carries `searchParams`. Adding `params?: ParamSchema<unknown>` follows the same pattern. Stored at `defineRoutes()` time, read at `matchRoute()` time.

### 4.2 `RouteConfigLike` constraint — **Resolved (discussion)**

Adding `params?: ParamSchema<unknown>` to `RouteConfigLike` follows the same pattern as `searchParams?: SearchParamSchema<unknown>`. The loose `unknown` generic allows any concrete schema.

### 4.3 `matchRoute` returning `null` on parse failure — **Resolved (design decision)**

When `matchRoute` returns `null` for a URL that pattern-matches but fails param validation, the router treats it identically to "no route matched." The fallback/404 is rendered. This loses the "why" (which param was invalid) but is the simplest integration with zero `RouterView` changes.

The `parse()` call is wrapped in try/catch. If `parse()` throws (instead of returning `{ ok: false }`), the exception is caught and treated as a parse failure → `matchRoute` returns `null`.

## 5. Type Flow Map

```
RouteConfig.params: ParamSchema<T>
  |
defineRoutes<const T>() — stores schema in CompiledRoute.params
  |
matchRoute(routes, url)
  |-- matchPath extracts raw params: Record<string, string>
  |-- if leaf route has params schema:
  |     |-- try { schema.parse(rawParams) }
  |     |-- ok: true  → RouteMatch.parsedParams = data, return match
  |     |-- ok: false  → return null (no match)
  |     |-- catch     → return null (no match)
  |-- no schema → return match (params only, no parsedParams)
  |
useParams<TPath>() → ExtractParams<TPath>  (reads parsedParams ?? params)
useParams<T>()     → T                     (reads parsedParams ?? params)
```

**Erasure boundary:** `ParamSchema<T>` generic `T` is erased when stored in `CompiledRoute.params: ParamSchema<unknown>`. `useParams<T>()` is a developer assertion.

## 6. E2E Acceptance Test

```ts
// packages/integration-tests/src/__tests__/route-param-schema-walkthrough.test.ts

import { defineRoutes, matchRoute } from '@vertz/ui';
import type { ParamSchema } from '@vertz/ui';
import { describe, expect, it } from 'bun:test';

describe('Route param schema walkthrough', () => {
  const uuidSchema: ParamSchema<{ id: string }> = {
    parse(raw) {
      const { id } = raw as { id: string };
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) return { ok: false, error: `Invalid UUID: ${id}` };
      return { ok: true, data: { id } };
    },
  };

  const routes = defineRoutes({
    '/': { component: () => document.createElement('div') },
    '/tasks/:id': {
      component: () => document.createElement('div'),
      params: uuidSchema,
    },
    '/items/:id': {
      component: () => document.createElement('div'),
    },
  });

  it('parses valid params through schema', () => {
    const match = matchRoute(routes, '/tasks/550e8400-e29b-41d4-a716-446655440000');
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(match!.parsedParams).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('returns null when schema rejects params', () => {
    const match = matchRoute(routes, '/tasks/not-a-uuid');
    expect(match).toBeNull();
  });

  it('works without schema (backward compat)', () => {
    const match = matchRoute(routes, '/items/42');
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: '42' });
    expect(match!.parsedParams).toBeUndefined();
  });
});
```

Type-level test:

```ts
// packages/integration-tests/src/__tests__/route-param-schema-walkthrough.test-d.ts

import type { ParamSchema } from '@vertz/ui';
import { defineRoutes, useParams } from '@vertz/ui';

// ParamSchema accepted in route config
const schema: ParamSchema<{ id: string }> = {
  parse(raw) {
    const { id } = raw as { id: string };
    return { ok: true, data: { id } };
  },
};

defineRoutes({
  '/tasks/:id': {
    component: () => document.createElement('div'),
    params: schema,
  },
});

// Backward compat — path literal → string params
const strParams = useParams<'/tasks/:id'>();
const _id: string = strParams.id;
void _id;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
strParams.name;

// Parsed type assertion
const parsedParams = useParams<{ id: string }>();
const _parsedId: string = parsedParams.id;
void _parsedId;

// @ts-expect-error - 'name' not on { id: string }
parsedParams.name;
```

## 7. Implementation Phases

### Phase 1: Type infrastructure + walkthrough stub

Add `ParamSchema<T>` type. Add `params` field to `RouteConfig`, `RouteConfigLike`, and `CompiledRoute`. Write integration walkthrough test as failing RED stub.

**Acceptance criteria:**
- `ParamSchema<T>` interface defined
- `RouteConfig` accepts `params?: ParamSchema<TParams>`
- `RouteConfigLike` accepts `params?: ParamSchema<unknown>`
- `CompiledRoute` stores `params?: ParamSchema<unknown>`
- `defineRoutes()` copies `params` to compiled routes
- Type test: route config with `params` compiles
- Type test: `@ts-expect-error` on schema with wrong interface
- Existing tests pass unchanged (backward compat)
- Integration walkthrough test written (RED — `matchRoute` doesn't parse yet, `ParamSchema` not exported)

### Phase 2: Runtime parsing in `matchRoute()`

When a matched leaf route has a `params` schema, run `parse()` on raw params. On success, set `parsedParams`. On failure (or throw), return `null`.

**Acceptance criteria:**
- `matchRoute()` with valid params + schema → match with `parsedParams`
- `matchRoute()` with invalid params + schema → returns `null`
- `matchRoute()` with schema that throws → returns `null`
- `matchRoute()` without schema → match without `parsedParams` (backward compat)
- Raw `params` always present on successful matches
- Nested route: leaf schema receives all accumulated params
- Integration test: valid UUID matches, invalid UUID returns null

### Phase 3: `useParams()` overload

Add `Record<string, unknown>` overload. Runtime reads `parsedParams` when available.

**Acceptance criteria:**
- `useParams<'/tasks/:id'>()` returns `{ id: string }` (backward compat)
- `useParams<{ id: string }>()` compiles and returns `{ id: string }`
- Runtime: returns `parsedParams` when available, falls back to `params`
- Type test: `@ts-expect-error` on invalid property for both overloads
- Type test: overload 1 selected for string literals, overload 2 for Record types

### Phase 4: Exports + integration tests + changeset

Export `ParamSchema` from public API. Run full integration walkthrough. Add changeset.

**Acceptance criteria:**
- `ParamSchema` exported from `@vertz/ui` (public.ts, index.ts)
- `matchRoute` exported from `@vertz/ui` (verify already exported)
- Integration runtime test passes (public imports)
- Integration type test passes (`bun run typecheck --filter @vertz/integration-tests`)
- All quality gates pass (lint, format, typecheck across all packages)
- Changeset added (`@vertz/ui` patch)

## 8. Developer Walkthrough

1. **Define a param schema:**
   ```tsx
   import type { ParamSchema } from '@vertz/ui';

   const taskParamsSchema: ParamSchema<{ id: string }> = {
     parse(raw) {
       const { id } = raw as { id: string };
       const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
       if (!uuidRegex.test(id)) return { ok: false, error: new Error(`Invalid task ID: ${id}`) };
       return { ok: true, data: { id } };
     },
   };
   ```

2. **Attach to route definition:**
   ```tsx
   import { defineRoutes } from '@vertz/ui';

   export const routes = defineRoutes({
     '/tasks/:id': {
       component: () => TaskDetailPage(),
       params: taskParamsSchema,
     },
   });
   ```

3. **Read params in component:**
   ```tsx
   import { useParams } from '@vertz/ui';

   export function TaskDetailPage() {
     const { id } = useParams<'/tasks/:id'>();
     // id: string — validated by schema before this code runs
     // Invalid IDs trigger the fallback/404 — never reach this component
   }
   ```

4. **No extra config. No plugins. Same `defineRoutes` call, with an optional `params` field.**

## 9. Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/router/define-routes.ts` | Add `ParamSchema<T>`, add `params` to `RouteConfig`/`RouteConfigLike`/`CompiledRoute`, update `matchRoute()` parsing |
| `packages/ui/src/router/router-context.ts` | Add `useParams` overload |
| `packages/ui/src/router/index.ts` | Export `ParamSchema` |
| `packages/ui/src/router/public.ts` | Export `ParamSchema` |
| `packages/ui/src/index.ts` | Export `ParamSchema` |
| `packages/ui/src/router/__tests__/define-routes.test.ts` | Tests for param parsing in `matchRoute` |
| `packages/ui/src/router/__tests__/router-context.test.ts` | Tests for `useParams` overload |
| `packages/ui/src/router/__tests__/param-schema.test-d.ts` | Type tests |
| `packages/integration-tests/src/__tests__/route-param-schema-walkthrough.test.ts` | Runtime integration walkthrough |
| `packages/integration-tests/src/__tests__/route-param-schema-walkthrough.test-d.ts` | Type integration walkthrough |
| `.changeset/*.md` | Patch changeset for `@vertz/ui` |

## 10. Adversarial Review Summary

Issues found and how they were addressed:

| Issue | Severity | Resolution |
|-------|----------|------------|
| C2: RouterView has no error handling | Critical | Descoped. `matchRoute` returns `null` on failure → existing fallback handles it. |
| C3: `navigate.ts` loader guard missing | Critical | Not needed — `matchRoute` returns `null`, so `match` is falsy and loaders don't run. |
| C4: SSR sync hook paramError | Critical | Not needed — SSR calls `matchRoute` which returns `null` on failure. |
| C1: `useParams` overload type assertion unsound | Critical | Documented limitation. Same trade-off as existing `useParams<TPath>()`. |
| I1: Nested route schema behavior | Important | Specified: leaf schema only, receives all accumulated params. |
| I2: `parse()` throwing | Important | Wrapped in try/catch → treated as failure → `null`. |
| I5: `errorComponent` signature mismatch | Important | Not applicable — `errorComponent` integration descoped. |
| I7: `executeLoaders` type signature | Important | Descoped — loaders always receive raw string params. |
| M3: `matchRoute` not in public exports | Minor | Must verify and add to public exports if missing. |

## 11. Follow-up Work (Explicitly Deferred)

- **`RouterView` error component for param failures** — Build `errorComponent` rendering in `RouterView`, add `paramError` to `RouteMatch` instead of returning `null`.
- **Typed parsed params for loaders** — Pass parsed params to loaders with correct types.
- **Automatic `useParams` type inference from route map** — Thread param schema type through `TypedRoutes<T>` → `Router<T>` → `useParams`.
- **`d.object()` conformance** — Make `@vertz/db` schema DSL produce objects conforming to `ParamSchema<T>`.
