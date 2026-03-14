# Type-Safe Router — Implementation Plan

**Design doc:** [plans/type-safe-router.md](./type-safe-router.md) (approved, 3/3 sign-offs)
**Issue:** [#572](https://github.com/vertz-dev/vertz/issues/572)
**Package:** `@vertz/ui`

---

## Dependency Map

```
Phase 1: POC + Type Utilities (PathWithParams, RoutePaths)
  |
  '--> Phase 2: defineRoutes<const T>() + TypedRoutes<T>
         |
         '--> Phase 3: TypedRouter<T> + createRouter<T>() + typed navigate
                |
                '--> Phase 4: useRouter<T>() + useParams<TPath>()
                |      |
                |      '--> Phase 5: Typed Link
                |
                '--> Phase 6: Exports, Example Update, Changeset
```

**All phases are sequential.** Each depends on the previous. No parallelization — the type chain must be verified incrementally.

---

## Phase 1: POC + Type Utilities

**What it implements:** Verifies the `const T extends RouteConfigLike` constraint works (design doc unknown 4.5), then implements `PathWithParams<T>` and `RoutePaths<T>` type utilities. Also creates the E2E acceptance test file (failing — RED state) and the Developer Walkthrough test stub in `packages/integration-tests/`.

**Blocked by:** Nothing — starting phase.

### Subtasks

1. **POC: `const T extends RouteConfigLike` constraint** — Create a TypeScript Playground or local `.ts` file that verifies:
   - `defineRoutes<const T extends Record<string, RouteConfigLike>>(map: T)` preserves literal keys
   - A concrete loader accessing `params.id` satisfies the constraint
   - A loader with *no* params access (`() => { return {} }`) satisfies the constraint
   - `RouteConfigLike` with `params: Record<string, string>` doesn't reject valid loaders
   - If POC fails, redesign the constraint before proceeding

2. **Implement `PathWithParams<T>`** in `packages/ui/src/router/params.ts`

3. **Implement `RoutePaths<T>`** in `packages/ui/src/router/params.ts`

4. **Type tests** in `packages/ui/src/router/__tests__/router.test-d.ts`

5. **Create E2E acceptance test file** at `packages/ui/src/router/__tests__/type-safe-router.test-d.ts` — will fail to compile (RED state) until Phase 5

6. **Create Developer Walkthrough test stub** at `packages/integration-tests/src/__tests__/type-safe-router-walkthrough.test-d.ts` — uses public package imports (`@vertz/ui`), will fail until all phases complete. This catches cross-package type issues per `public-api-validation.md`.

### Files modified

- `packages/ui/src/router/params.ts` — add `PathWithParams<T>`, `RoutePaths<T>`
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests
- `packages/ui/src/router/__tests__/type-safe-router.test-d.ts` — E2E type acceptance test (failing RED state)
- `packages/integration-tests/src/__tests__/type-safe-router-walkthrough.test-d.ts` — Developer Walkthrough stub (failing RED state, uses `@vertz/ui` imports)

### TDD cycles

1. **RED:** Type test: `PathWithParams<'/tasks/:id'>` should equal `` `/tasks/${string}` ``
   **GREEN:** Implement `PathWithParams<T>` with wildcard, `:param`, and static branches

2. **RED:** Type test: `PathWithParams<'/users/:id/posts/:postId'>` equals `` `/users/${string}/posts/${string}` ``
   **GREEN:** Recursive case handles multi-param

3. **RED:** Type test: `PathWithParams<'/files/*'>` equals `` `/files/${string}` ``
   **GREEN:** Wildcard branch (checked first)

4. **RED:** Type test: `PathWithParams<string>` equals `string` (backward compat)
   **GREEN:** Base case handles `string`

5. **RED:** Type test: `PathWithParams<'/tasks/:id/'>` (trailing slash) equals `` `/tasks/${string}/` ``
   **GREEN:** Recursive case handles trailing slash naturally

6. **RED:** Type test: `RoutePaths<{ '/': RouteConfig, '/tasks/:id': RouteConfig }>` — `'/tasks/42'` extends it, `'/nonexistent'` does not
   **GREEN:** Implement `RoutePaths<T>` mapped type

7. **RED:** Type test: `RoutePaths<Record<string, never>>` equals `never` (empty route map)
   **GREEN:** Empty mapped type produces `never` union naturally

### Integration test acceptance criteria

```typescript
// IT-P1-1: PathWithParams handles all edge cases
type _Static = PathWithParams<'/'>;
const _s: _Static = '/'; // OK
void _s;

type _Param = PathWithParams<'/tasks/:id'>;
const _p: _Param = `/tasks/${42}`; // OK
void _p;

type _Multi = PathWithParams<'/users/:id/posts/:postId'>;
const _m: _Multi = `/users/${'a'}/posts/${'b'}`; // OK
void _m;

type _Wild = PathWithParams<'/files/*'>;
const _w: _Wild = `/files/any/path`; // OK
void _w;

type _Trail = PathWithParams<'/tasks/:id/'>;
const _t: _Trail = `/tasks/42/`; // trailing slash preserved
void _t;

type _Fallback = PathWithParams<string>;
const _f: _Fallback = 'anything'; // backward compat
void _f;

// IT-P1-2: RoutePaths produces correct union
type TestRouteMap = {
  '/': { component: () => Node };
  '/tasks/:id': { component: () => Node };
  '/settings': { component: () => Node };
};

type TestPaths = RoutePaths<TestRouteMap>;

const _valid1: TestPaths = '/';
const _valid2: TestPaths = '/tasks/42';
const _valid3: TestPaths = '/settings';
void _valid1; void _valid2; void _valid3;

// @ts-expect-error - '/nonexistent' is not a valid path
const _invalid: TestPaths = '/nonexistent';
void _invalid;

// IT-P1-3: RoutePaths<RouteDefinitionMap> = string (backward compat)
type FallbackPaths = RoutePaths<RouteDefinitionMap>;
const _any: FallbackPaths = '/literally-anything';
void _any;

// IT-P1-4: RoutePaths of empty map is never
type EmptyPaths = RoutePaths<Record<string, never>>;
// @ts-expect-error - never accepts nothing
const _empty: EmptyPaths = '/anything';
void _empty;
```

### Acceptance criteria

- [ ] POC confirms `const T extends RouteConfigLike` works with concrete loaders (with and without params access)
- [ ] All type tests pass via `bun run typecheck --filter @vertz/ui`
- [ ] `PathWithParams` handles: static, single param, multi param, wildcard, trailing slash, `string` fallback
- [ ] `RoutePaths` produces correct union, rejects invalid paths, empty map → `never`
- [ ] E2E acceptance test file created (failing — expected at this phase)
- [ ] Developer Walkthrough stub created in `packages/integration-tests/` with `@vertz/ui` imports (failing — expected)
- [ ] Lint clean: `bunx biome check packages/ui/src/router/params.ts`

---

## Phase 2: Generic `defineRoutes<const T>()`

**What it implements:** Makes `defineRoutes` generic to preserve literal route keys via `TypedRoutes<T>` phantom branded type.

**Blocked by:** Phase 1 (type utilities + POC confirmation)

### Subtasks

1. **Add `RouteConfigLike` interface** to `packages/ui/src/router/define-routes.ts`
2. **Add `TypedRoutes<T>` branded type** to `packages/ui/src/router/define-routes.ts`
3. **Make `defineRoutes` generic** with `<const T extends Record<string, RouteConfigLike>>`
4. **Type tests** verifying literal key preservation

### Files modified

- `packages/ui/src/router/define-routes.ts` — add `RouteConfigLike`, `TypedRoutes<T>`, make `defineRoutes` generic
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests

### TDD cycles

1. **RED:** Type test: `defineRoutes({ '/tasks/:id': { component: ... } })` — the result's `__routes` should have literal key `'/tasks/:id'`
   **GREEN:** Add `const T` generic, return `TypedRoutes<T>` with cast. Verify all existing runtime tests still pass (regression check — no behavior change).

2. **RED:** Type test: `TypedRoutes<T>` is assignable to `CompiledRoute[]` — must compile when passed to functions expecting `CompiledRoute[]`
   **GREEN:** Intersection type `CompiledRoute[] & { readonly __routes: T }` handles this

3. **RED:** Type test: `defineRoutes` with a loader accessing `params.id` compiles
   **GREEN:** `RouteConfigLike` constraint uses `Record<string, string>` for loader params

4. **RED:** Type test: `[...typedRoutes]` produces `CompiledRoute[]` (brand stripped) — document this as intentional behavior
   **GREEN:** Array spread naturally strips the intersection brand

### Integration test acceptance criteria

```typescript
// IT-P2-1: defineRoutes preserves literal keys
const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': {
    component: () => document.createElement('div'),
    loader: ({ params }) => {
      const _id: string = params.id; // Must compile — loader params work
      void _id;
      return {};
    },
  },
});

// Access phantom type — literal key preserved
type RouteMap = (typeof routes)['__routes'];
type Keys = keyof RouteMap;

// @ts-expect-error - '/nonexistent' is not a key
const _badKey: Keys = '/nonexistent';
void _badKey;

// IT-P2-2: TypedRoutes<T> assignable to CompiledRoute[]
const asArray: CompiledRoute[] = routes; // Must compile
void asArray;

// IT-P2-3: Array spread strips phantom brand (intentional)
const spread = [...routes]; // spread is CompiledRoute[], not TypedRoutes<T>
const _spreadCheck: CompiledRoute[] = spread;
void _spreadCheck;
```

### Acceptance criteria

- [ ] `defineRoutes` preserves literal keys with `const T`
- [ ] `TypedRoutes<T>` assignable to `CompiledRoute[]`
- [ ] Loader with `params.id` compiles against the constraint
- [ ] Array spread strips brand (tested + documented as intentional)
- [ ] All existing runtime tests pass (no behavior change)
- [ ] `bun run typecheck --filter @vertz/ui` — clean
- [ ] `bunx biome check packages/ui/src/router/define-routes.ts` — clean

---

## Phase 3: `TypedRouter<T>` + `createRouter<T>()` + Typed Navigate

**What it implements:** `TypedRouter<T>` type with dual navigate overload, `createRouter<T>()` returning `TypedRouter<T>`, typed navigate that rejects invalid paths.

**Blocked by:** Phase 2 (`TypedRoutes<T>` from `defineRoutes`)

### Subtasks

1. **Add `TypedRouter<T>` type** to `packages/ui/src/router/navigate.ts`
2. **Make `createRouter` generic** — infer `T` from `TypedRoutes<T>` parameter
3. **Type tests** for navigate validation, context boundary assignability, backward compat

### Files modified

- `packages/ui/src/router/navigate.ts` — add `TypedRouter<T>`, make `createRouter` generic
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests

### TDD cycles

1. **RED:** Type test: `createRouter(typedRoutes).navigate('/nonexistent')` should be a `@ts-expect-error`
   **GREEN:** `createRouter<T>()` returns `TypedRouter<T>` with `navigate: (url: RoutePaths<T>) => ...`. Verify all existing runtime tests still pass (regression check).

2. **RED:** Type test: `createRouter(typedRoutes).navigate('/tasks/42')` should compile (matches `` `/tasks/${string}` ``)
   **GREEN:** Template literal matching handles this

3. **RED:** Type test: `TypedRouter<T>` must be assignable to `Router` (context boundary)
   **GREEN:** Dual navigate overload — second overload `(url: string)` satisfies `Router.navigate`

4. **RED:** Type test: Unparameterized `Router` still accepts any string navigate
   **GREEN:** `Router` interface unchanged — `navigate: (url: string) => Promise<void>`

### Integration test acceptance criteria

```typescript
// IT-P3-1: End-to-end type flow from defineRoutes → createRouter → navigate
const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
});

const router = createRouter(routes, '/');

// Valid paths compile
router.navigate('/');
router.navigate('/tasks/42');
router.navigate('/settings');

// @ts-expect-error - invalid path
router.navigate('/nonexistent');

// @ts-expect-error - partial param path
router.navigate('/tasks');

// IT-P3-2: TypedRouter<T> assignable to Router (context boundary)
const asRouter: Router = router; // Must compile
void asRouter;

// IT-P3-3: Backward compat — plain Router accepts any string
declare const plainRouter: Router;
plainRouter.navigate('/anything'); // Must compile
```

### Acceptance criteria

- [ ] Typed navigate rejects invalid paths
- [ ] Typed navigate accepts valid paths (static + parameterized)
- [ ] `TypedRouter<T>` assignable to `Router` (no contravariance)
- [ ] Plain `Router` backward compat preserved
- [ ] All existing runtime tests pass
- [ ] `bun run typecheck --filter @vertz/ui` — clean
- [ ] `bunx biome check packages/ui/src/router/navigate.ts` — clean

---

## Phase 4: `useRouter<T>()` + `useParams<TPath>()`

**What it implements:** Generic `useRouter<T>()` returning `TypedRouter<T>`, new `useParams<TPath>()` function returning `ExtractParams<TPath>`. Updates `ui-components.md` with `useParams` pattern.

**Blocked by:** Phase 3 (`TypedRouter<T>`)

### Cast point

`useRouter<T>()` is the second intentional cast point in the type chain (the first is `defineRoutes` returning `TypedRoutes<T>`). Internally it does `return useContext(RouterContext) as TypedRouter<T>` — casting from the stored `Router` to `TypedRouter<T>`. This is safe because the only way to create a `Router` is via `createRouter()`, which returns `TypedRouter<T>` at the type level.

### `useRouter<T>()` generic ergonomics

The generic parameter `T` accepts the **route map type** (not `TypedRoutes<T>`). To avoid making developers extract `__routes` manually, provide an `InferRouteMap<T>` utility type:

```ts
// Utility to extract the route map from TypedRoutes
type InferRouteMap<T> = T extends TypedRoutes<infer R> ? R : T;

// Developer usage — just pass typeof routes
const router = useRouter<InferRouteMap<typeof routes>>();
```

Alternatively, `useRouter` can be overloaded to accept `TypedRoutes<T>` directly and infer `T`. The implementation should choose whichever approach requires the least ceremony at the call site. The recommended pattern is `useAppRouter()`:

```ts
// In app routes file:
export function useAppRouter() {
  return useRouter<InferRouteMap<typeof routes>>();
}
```

### Subtasks

1. **Add `InferRouteMap<T>` utility type** to `packages/ui/src/router/define-routes.ts` (or `params.ts`)
2. **Make `useRouter` generic** in `packages/ui/src/router/router-context.ts`
3. **Create `useParams<TPath>()`** in `packages/ui/src/router/router-context.ts` — throws with `useParams`-specific error message (not the generic `useRouter` message)
4. **Runtime tests** for `useParams` — throws outside provider (with `useParams`-specific message), returns params inside provider
5. **Type tests** for `useRouter<T>()`, `useParams<TPath>()`, and `InferRouteMap`
6. **Update `ui-components.md`** — add `useParams<TPath>()` pattern alongside existing `router.current.value?.params` pattern, document when to use each

### Files modified

- `packages/ui/src/router/router-context.ts` — make `useRouter` generic, add `useParams`
- `packages/ui/src/router/define-routes.ts` (or `params.ts`) — add `InferRouteMap<T>`
- `packages/ui/src/router/__tests__/router-context.test.ts` — runtime tests for `useParams`
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests
- `.claude/rules/ui-components.md` — add `useParams` pattern (don't wait until Phase 6)

### TDD cycles

1. **RED:** Runtime test: `useParams()` throws `"useParams() must be called within RouterContext.Provider"` when called outside provider
   **GREEN:** Implement `useParams` — wraps `useContext(RouterContext)` with its own null check and `useParams`-specific error message, then reads `current.value?.params`

2. **RED:** Runtime test: `useParams()` returns correct params when a route is matched
   **GREEN:** Read `router.current.value?.params` and return

3. **RED:** Type test: `useParams<'/tasks/:id'>()` returns `{ id: string }` — positive
   **GREEN:** Return type is `ExtractParams<TPath>`

4. **RED:** Type test: `useParams<'/tasks/:id'>().name` — `@ts-expect-error` (negative)
   **GREEN:** Already rejected by `ExtractParams`

5. **RED:** Type test: `useRouter<InferRouteMap<typeof routes>>().navigate('/bad')` — `@ts-expect-error` (developer-facing usage)
   **GREEN:** `useRouter<T>()` returns `TypedRouter<T>`; `InferRouteMap` extracts `T` from `TypedRoutes<T>`

6. **RED:** Type test: `useRouter()` (no param) returns `Router` — accepts any string
   **GREEN:** Default `T = RouteDefinitionMap` → returns `Router`

### Integration test acceptance criteria

```typescript
// IT-P4-1: useParams returns typed params inside provider
test('useParams returns route params', () => {
  const routes = defineRoutes({
    '/tasks/:id': { component: () => document.createElement('div') },
  });
  const router = createRouter(routes, '/tasks/42');

  let params: Record<string, string> | undefined;
  RouterContext.Provider(router, () => {
    params = useParams();
  });

  expect(params).toEqual({ id: '42' });
});

// IT-P4-2: useParams throws with useParams-specific message
test('useParams throws without RouterContext.Provider', () => {
  expect(() => useParams()).toThrow('useParams()');
});

// IT-P4-3: Type test — useParams<TPath> returns ExtractParams<TPath>
const _params = useParams<'/tasks/:id'>();
const _id: string = _params.id; // OK
void _id;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
const _bad = _params.name;
void _bad;

// IT-P4-4: Type test — useRouter with InferRouteMap (developer-facing usage)
const _routes = defineRoutes({
  '/tasks/:id': { component: () => document.createElement('div') },
});
const _router = useRouter<InferRouteMap<typeof _routes>>();
_router.navigate('/tasks/42'); // OK

// @ts-expect-error - invalid path
_router.navigate('/bad');

// IT-P4-5: Type test — useRouter() (no param) accepts any string
const _untypedRouter = useRouter();
_untypedRouter.navigate('/anything'); // OK — backward compat
```

### Acceptance criteria

- [ ] `useParams()` throws with `useParams`-specific error message outside provider
- [ ] `useParams()` returns correct params inside provider
- [ ] `useParams<TPath>()` type tests pass (positive + negative)
- [ ] `InferRouteMap<T>` correctly extracts route map from `TypedRoutes<T>`
- [ ] `useRouter<InferRouteMap<typeof routes>>()` works without manual `__routes` extraction
- [ ] `useRouter()` (no param) backward compat
- [ ] `ui-components.md` updated with `useParams` pattern and usage guidance
- [ ] All existing runtime tests pass
- [ ] `bun run typecheck --filter @vertz/ui` — clean
- [ ] `bunx biome check packages/ui/src/router/router-context.ts` — clean

---

## Phase 5: Typed Link

**What it implements:** Makes `createLink` generic so that the returned Link component validates `href` against `RoutePaths<T>`.

**Blocked by:** Phase 4 (type utilities fully in place)

### Subtasks

1. **Make `createLink` generic** with `<T extends Record<string, RouteConfigLike> = RouteDefinitionMap>`
2. **Make `LinkProps` generic** — `href: RoutePaths<T>`
3. **Type tests** for typed and untyped Link

### Files modified

- `packages/ui/src/router/link.ts` — make `createLink` and `LinkProps` generic
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests

### TDD cycles

1. **RED:** Type test: `Link({ href: '/nonexistent', children: 'Bad' })` should be `@ts-expect-error` when Link is created with typed routes
   **GREEN:** `createLink<T>()` returns function with `LinkProps<T>` where `href: RoutePaths<T>`

2. **RED:** Type test: `Link({ href: '/tasks/42', children: 'OK' })` compiles with typed routes
   **GREEN:** Template literal matching

3. **RED:** Type test: Untyped `createLink()` accepts any string href (backward compat)
   **GREEN:** Default `T = RouteDefinitionMap` → `RoutePaths<RouteDefinitionMap>` = `string`. Verify all existing runtime tests still pass (regression check).

### Integration test acceptance criteria

```typescript
// IT-P5-1: Typed Link rejects invalid href
type TestMap = { '/': { component: () => Node }; '/tasks/:id': { component: () => Node } };

declare const typedLink: (props: LinkProps<TestMap>) => HTMLAnchorElement;

typedLink({ href: '/', children: 'Home' }); // OK
typedLink({ href: '/tasks/42', children: 'Task' }); // OK

// @ts-expect-error - invalid path
typedLink({ href: '/nonexistent', children: 'Bad' });

// IT-P5-2: Untyped Link accepts any href
declare const untypedLink: (props: LinkProps) => HTMLAnchorElement;
untypedLink({ href: '/anything', children: 'OK' }); // backward compat
```

### Acceptance criteria

- [ ] Typed Link rejects invalid href
- [ ] Typed Link accepts valid href (static + parameterized)
- [ ] Untyped Link backward compat
- [ ] All existing runtime tests pass
- [ ] `bun run typecheck --filter @vertz/ui` — clean
- [ ] `bunx biome check packages/ui/src/router/link.ts` — clean

---

## Phase 6: Exports, Example Update, Changeset

**What it implements:** Public API exports, subpath exports update, example app fully updated to demonstrate typed router, changeset, Developer Walkthrough passes, quality gates.

**Blocked by:** Phase 5 (all types in place)

### Subtasks

1. **Update exports** — add to `index.ts`, `public.ts`, `router/index.ts`:
   - Runtime: `useParams` (regular export)
   - Type-only: `export type { TypedRouter, TypedRoutes, RoutePaths, PathWithParams, InferRouteMap }` (no runtime value)

2. **Update subpath exports test** — `packages/ui/src/__tests__/subpath-exports.test.ts`:
   - Add `'useParams'` to the `expectedExports` array (sorted position)
   - Add `expect(subpath.useParams).toBe(main.useParams)` to the "same references as main barrel" test
   - Add `expect(main.useParams).toBeTypeOf('function')` to the "main barrel re-exports all router symbols" test

3. **Update task-manager example — `router.ts`:**
   - **Remove the `: Router` annotation** on `appRouter` — this currently erases the typed inference from `createRouter()`. Let TypeScript infer the type.
   - **Add `useAppRouter()` export** — the recommended pattern from the design doc for typed navigation:
     ```ts
     export function useAppRouter() {
       return useRouter<InferRouteMap<typeof routes>>();
     }
     ```
   - **Wire `createLink<T>()`** — pass the route map type to `createLink` so Link href is validated:
     ```ts
     export const Link = createLink<InferRouteMap<typeof routes>>(currentPath, (url) => {
       appRouter.navigate(url);
     });
     ```

4. **Update task-manager example — `task-detail.tsx`:**
   - Replace `router.current.value?.params.id ?? ''` with `useParams<'/tasks/:id'>()`
   - Replace `const { navigate } = useRouter()` with `const { navigate } = useAppRouter()`
   - This demonstrates both `useParams` and typed navigate in a real page

5. **Update `ui-components.md`** — add `useAppRouter()` pattern (the `useParams` pattern was already added in Phase 4). Document when to use each pattern:
   - `useParams<TPath>()` — when you only need typed params
   - `useAppRouter()` — when you need typed navigate
   - `useRouter()` — backward compat, library code that shouldn't depend on a specific route map

6. **Create changeset** — `@vertz/ui` patch. Description should explicitly state backward compatibility:
   ```markdown
   ---
   '@vertz/ui': patch
   ---
   Add type-safe router: navigate(), useParams(), and Link href are validated
   against defined route paths at compile time. Fully backward-compatible —
   existing code compiles unchanged.
   ```

7. **Verify Developer Walkthrough** — the stub created in Phase 1 at `packages/integration-tests/src/__tests__/type-safe-router-walkthrough.test-d.ts` should now pass. Run `bun run typecheck --filter @vertz/integration-tests` to confirm.

8. **Full quality gates** — typecheck, lint, test across monorepo

9. **Post-implementation retrospective** — create `plans/post-implementation-reviews/type-safe-router.md` per `definition-of-done.md`

### Files modified

- `packages/ui/src/router/index.ts` — add exports
- `packages/ui/src/router/public.ts` — add runtime + type-only exports
- `packages/ui/src/index.ts` — add exports
- `packages/ui/src/__tests__/subpath-exports.test.ts` — add `useParams` to `expectedExports`, "same references", and "main barrel" tests
- `examples/task-manager/src/router.ts` — remove `: Router` annotation, add `useAppRouter()`, wire `createLink<T>()`
- `examples/task-manager/src/pages/task-detail.tsx` — use `useParams<'/tasks/:id'>()` and `useAppRouter()`
- `.claude/rules/ui-components.md` — add `useAppRouter` pattern
- `.changeset/*.md` — patch changeset
- `plans/post-implementation-reviews/type-safe-router.md` — retrospective

### Integration test acceptance criteria

```typescript
// IT-P6-1: Subpath exports include useParams
test('router subpath exports include useParams', async () => {
  const mod = await import('../router/public');
  expect(mod.useParams).toBeTypeOf('function');
});

// IT-P6-2: Main barrel re-exports useParams
test('main barrel re-exports useParams', async () => {
  const main = await import('../index');
  expect(main.useParams).toBeTypeOf('function');
});

// IT-P6-3: Same reference check
test('subpath useParams is same as main barrel', async () => {
  const main = await import('../index');
  const subpath = await import('../router/public');
  expect(subpath.useParams).toBe(main.useParams);
});

// IT-P6-4: Developer Walkthrough passes cross-package typecheck
// bun run typecheck --filter @vertz/integration-tests — must be clean
```

### Acceptance criteria

- [ ] `useParams` exported from all barrels (runtime export)
- [ ] `TypedRouter`, `TypedRoutes`, `RoutePaths`, `PathWithParams`, `InferRouteMap` exported as `export type` from all barrels
- [ ] Subpath exports test passes — `expectedExports` array, "same references", and "main barrel" tests all updated
- [ ] Example `router.ts`: `: Router` annotation removed, `useAppRouter()` exported, `createLink<T>()` wired
- [ ] Example `task-detail.tsx`: uses `useParams<'/tasks/:id'>()` and `useAppRouter()`
- [ ] Example compiles with `bun run typecheck` in scope
- [ ] `ui-components.md` updated with `useAppRouter` pattern and usage guidance
- [ ] Changeset created with backward-compatibility note
- [ ] Developer Walkthrough in `packages/integration-tests/` passes (`bun run typecheck --filter @vertz/integration-tests`)
- [ ] Post-implementation retrospective created
- [ ] `bun test packages/ui` — all pass
- [ ] `bun run typecheck` — clean (full monorepo)
- [ ] `bun run lint` — clean
- [ ] `bun test` — full monorepo passes

---

## E2E Acceptance Test (from design doc)

This is the final gate. Created in Phase 1 as a failing test, passes after Phase 5.

### Internal test (relative imports)

File: `packages/ui/src/router/__tests__/type-safe-router.test-d.ts`

```typescript
import type { Router } from '../navigate';
import type { TypedRouter } from '../navigate';
import { createRouter, defineRoutes, useParams, useRouter } from '../public';
import type { InferRouteMap } from '../define-routes';

const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/users/:userId/posts/:postId': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
  '/files/*': { component: () => document.createElement('div') },
});

const router = createRouter(routes);

// Valid paths
router.navigate('/');
router.navigate('/tasks/42');
router.navigate('/users/1/posts/99');
router.navigate('/settings');
router.navigate('/files/docs/readme.md');

// @ts-expect-error - invalid path
router.navigate('/nonexistent');

// @ts-expect-error - partial param path
router.navigate('/tasks');

// useParams typed
const params = useParams<'/tasks/:id'>();
const _id: string = params.id;
void _id;

// @ts-expect-error - 'name' not on params
const _bad = params.name;
void _bad;

// useRouter with InferRouteMap (developer-facing usage)
const typedRouter = useRouter<InferRouteMap<typeof routes>>();
typedRouter.navigate('/tasks/42'); // OK
// @ts-expect-error - invalid path via useRouter
typedRouter.navigate('/bad');

// Context boundary — TypedRouter assignable to Router
const _asRouter: Router = router;
void _asRouter;

// Backward compat
declare const untypedRouter: Router;
untypedRouter.navigate('/anything');
```

### Developer Walkthrough test (public package imports)

File: `packages/integration-tests/src/__tests__/type-safe-router-walkthrough.test-d.ts`

```typescript
import type { Router } from '@vertz/ui';
import { createRouter, defineRoutes, useParams, useRouter } from '@vertz/ui';
import type { InferRouteMap } from '@vertz/ui';

// Same test content as the internal test above, but using
// public package imports to catch cross-package type issues
// (bundler-inlined symbols, .d.ts generation, variance problems)
```

This is the test that `bun run typecheck --filter @vertz/integration-tests` validates.

---

## Verification

```bash
# Per phase
bun run typecheck --filter @vertz/ui
bunx biome check packages/ui/src/router/

# After all phases
bun test packages/ui
bun run typecheck
bun run lint
bun test

# Manual
cd examples/task-manager && bun run dev
```
