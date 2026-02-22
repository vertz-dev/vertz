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

**What it implements:** Verifies the `const T extends RouteConfigLike` constraint works (design doc unknown 4.5), then implements `PathWithParams<T>` and `RoutePaths<T>` type utilities.

**Blocked by:** Nothing — starting phase.

### Subtasks

1. **POC: `const T extends RouteConfigLike` constraint** — Create a TypeScript Playground or local `.ts` file that verifies:
   - `defineRoutes<const T extends Record<string, RouteConfigLike>>(map: T)` preserves literal keys
   - A concrete loader accessing `params.id` satisfies the constraint
   - `RouteConfigLike` with `params: Record<string, string>` doesn't reject valid loaders
   - If POC fails, redesign the constraint before proceeding

2. **Implement `PathWithParams<T>`** in `packages/ui/src/router/params.ts`

3. **Implement `RoutePaths<T>`** in `packages/ui/src/router/params.ts`

4. **Type tests** in `packages/ui/src/router/__tests__/router.test-d.ts`

### Files modified

- `packages/ui/src/router/params.ts` — add `PathWithParams<T>`, `RoutePaths<T>`
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests

### TDD cycles

1. **RED:** Type test: `PathWithParams<'/tasks/:id'>` should equal `` `/tasks/${string}` ``
   **GREEN:** Implement `PathWithParams<T>` with wildcard, `:param`, and static branches

2. **RED:** Type test: `PathWithParams<'/users/:id/posts/:postId'>` equals `` `/users/${string}/posts/${string}` ``
   **GREEN:** Recursive case handles multi-param

3. **RED:** Type test: `PathWithParams<'/files/*'>` equals `` `/files/${string}` ``
   **GREEN:** Wildcard branch (checked first)

4. **RED:** Type test: `PathWithParams<string>` equals `string` (backward compat)
   **GREEN:** Base case handles `string`

5. **RED:** Type test: `RoutePaths<{ '/': RouteConfig, '/tasks/:id': RouteConfig }>` — `'/tasks/42'` extends it, `'/nonexistent'` does not
   **GREEN:** Implement `RoutePaths<T>` mapped type

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
```

### Acceptance criteria

- [ ] POC confirms `const T extends RouteConfigLike` works with concrete loaders
- [ ] All type tests pass via `bun run typecheck --filter @vertz/ui`
- [ ] `PathWithParams` handles: static, single param, multi param, wildcard, `string` fallback
- [ ] `RoutePaths` produces correct union, rejects invalid paths
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
   **GREEN:** Add `const T` generic, return `TypedRoutes<T>` with cast

2. **RED:** Type test: `TypedRoutes<T>` is assignable to `CompiledRoute[]` — must compile when passed to functions expecting `CompiledRoute[]`
   **GREEN:** Intersection type `CompiledRoute[] & { readonly __routes: T }` handles this

3. **RED:** Type test: `defineRoutes` with a loader accessing `params.id` compiles
   **GREEN:** `RouteConfigLike` constraint uses `Record<string, string>` for loader params

4. **RED:** Runtime test: existing `defineRoutes` tests still pass (behavior unchanged)
   **GREEN:** Runtime behavior is identical — only the type signature changed

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
```

### Acceptance criteria

- [ ] `defineRoutes` preserves literal keys with `const T`
- [ ] `TypedRoutes<T>` assignable to `CompiledRoute[]`
- [ ] Loader with `params.id` compiles against the constraint
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
   **GREEN:** `createRouter<T>()` returns `TypedRouter<T>` with `navigate: (url: RoutePaths<T>) => ...`

2. **RED:** Type test: `createRouter(typedRoutes).navigate('/tasks/42')` should compile (matches `` `/tasks/${string}` ``)
   **GREEN:** Template literal matching handles this

3. **RED:** Type test: `TypedRouter<T>` must be assignable to `Router` (context boundary)
   **GREEN:** Dual navigate overload — second overload `(url: string)` satisfies `Router.navigate`

4. **RED:** Type test: Unparameterized `Router` still accepts any string navigate
   **GREEN:** `Router` interface unchanged — `navigate: (url: string) => Promise<void>`

5. **RED:** Runtime test: All existing `createRouter` tests still pass
   **GREEN:** Runtime behavior identical — only type signature changed

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

**What it implements:** Generic `useRouter<T>()` returning `TypedRouter<T>`, new `useParams<TPath>()` function returning `ExtractParams<TPath>`.

**Blocked by:** Phase 3 (`TypedRouter<T>`)

### Subtasks

1. **Make `useRouter` generic** in `packages/ui/src/router/router-context.ts`
2. **Create `useParams<TPath>()`** in `packages/ui/src/router/router-context.ts` (same file — it's a thin wrapper over `useRouter`)
3. **Runtime tests** for `useParams` — throws outside provider, returns params inside provider
4. **Type tests** for `useRouter<T>()` and `useParams<TPath>()`

### Files modified

- `packages/ui/src/router/router-context.ts` — make `useRouter` generic, add `useParams`
- `packages/ui/src/router/__tests__/router-context.test.ts` — runtime tests for `useParams`
- `packages/ui/src/router/__tests__/router.test-d.ts` — type tests

### TDD cycles

1. **RED:** Runtime test: `useParams()` throws when called outside `RouterContext.Provider`
   **GREEN:** Implement `useParams` — calls `useRouter()` internally, reads `current.value?.params`

2. **RED:** Runtime test: `useParams()` returns correct params when a route is matched
   **GREEN:** Read `router.current.value?.params` and return

3. **RED:** Type test: `useParams<'/tasks/:id'>()` returns `{ id: string }` — positive
   **GREEN:** Return type is `ExtractParams<TPath>`

4. **RED:** Type test: `useParams<'/tasks/:id'>().name` — `@ts-expect-error` (negative)
   **GREEN:** Already rejected by `ExtractParams`

5. **RED:** Type test: `useRouter<typeof routes>().navigate('/bad')` — `@ts-expect-error`
   **GREEN:** `useRouter<T>()` returns `TypedRouter<T>`

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

// IT-P4-2: useParams throws outside provider
test('useParams throws without RouterContext.Provider', () => {
  expect(() => useParams()).toThrow();
});

// IT-P4-3: Type test — useParams<TPath> returns ExtractParams<TPath>
const _params = useParams<'/tasks/:id'>();
const _id: string = _params.id; // OK
void _id;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
const _bad = _params.name;
void _bad;

// IT-P4-4: Type test — useRouter<T> returns TypedRouter<T>
declare const typedRoutes: TypedRoutes<{ '/tasks/:id': RouteConfigLike }>;
type T = (typeof typedRoutes)['__routes'];
const _router = useRouter<T>();
_router.navigate('/tasks/42'); // OK

// @ts-expect-error - invalid path
_router.navigate('/bad');
```

### Acceptance criteria

- [ ] `useParams()` throws outside provider
- [ ] `useParams()` returns correct params inside provider
- [ ] `useParams<TPath>()` type tests pass (positive + negative)
- [ ] `useRouter<T>()` returns `TypedRouter<T>` with typed navigate
- [ ] `useRouter()` (no param) backward compat
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
   **GREEN:** Default `T = RouteDefinitionMap` → `RoutePaths<RouteDefinitionMap>` = `string`

4. **RED:** Runtime test: existing Link tests still pass
   **GREEN:** Runtime behavior unchanged

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

**What it implements:** Public API exports, subpath exports update, example app updated to use `useParams`, changeset, quality gates.

**Blocked by:** Phase 5 (all types in place)

### Subtasks

1. **Update exports** — add `useParams`, `TypedRouter`, `TypedRoutes`, `RoutePaths`, `PathWithParams` to `index.ts`, `public.ts`, `router/index.ts`
2. **Update subpath exports test** — `packages/ui/src/__tests__/subpath-exports.test.ts`
3. **Update task-manager example** — `task-detail.tsx` uses `useParams<'/tasks/:id'>()`
4. **Update `ui-components.md` rule** — document `useParams` and `useAppRouter` pattern
5. **Create changeset** — `@vertz/ui` patch
6. **Full quality gates** — typecheck, lint, test across monorepo

### Files modified

- `packages/ui/src/router/index.ts` — add exports
- `packages/ui/src/router/public.ts` — add exports
- `packages/ui/src/index.ts` — add exports
- `packages/ui/src/__tests__/subpath-exports.test.ts` — update expected exports
- `examples/task-manager/src/pages/task-detail.tsx` — use `useParams<'/tasks/:id'>()`
- `examples/task-manager/src/router.ts` — verify type inference flows
- `.claude/rules/ui-components.md` — document `useParams`, `useAppRouter` pattern
- `.changeset/*.md` — patch changeset

### Integration test acceptance criteria

```typescript
// IT-P6-1: Subpath exports include new symbols
test('router subpath exports include useParams', async () => {
  const mod = await import('../router/public');
  expect(mod.useParams).toBeTypeOf('function');
});

// IT-P6-2: Main barrel re-exports useParams
test('main barrel re-exports useParams', async () => {
  const main = await import('../index');
  expect(main.useParams).toBeTypeOf('function');
});
```

### Acceptance criteria

- [ ] `useParams` exported from all barrels
- [ ] Subpath exports test passes
- [ ] Example compiles with `useParams<'/tasks/:id'>()`
- [ ] `ui-components.md` updated with `useParams` and `useAppRouter` patterns
- [ ] Changeset created
- [ ] `bun test packages/ui` — all pass
- [ ] `bun run typecheck` — clean (full monorepo)
- [ ] `bun run lint` — clean
- [ ] `bun test` — full monorepo passes

---

## E2E Acceptance Test (from design doc)

This is the final gate. Created in Phase 1 as a failing test, passes after Phase 5.

File: `packages/ui/src/router/__tests__/type-safe-router.test-d.ts`

```typescript
import type { Router } from '../navigate';
import type { TypedRouter } from '../navigate';
import { createRouter, defineRoutes, useParams, useRouter } from '../public';

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

// Context boundary — TypedRouter assignable to Router
const _asRouter: Router = router;
void _asRouter;

// Backward compat
declare const untypedRouter: Router;
untypedRouter.navigate('/anything');
```

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
