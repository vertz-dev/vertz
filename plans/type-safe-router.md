# Design Doc: Type-Safe Router — Typed Navigate, Params & Links

**Status:** In Review (v2 — addressing reviewer feedback)
**Author:** mike
**Feature:** Type-Safe Router [#572]
**Reviewers:**
- [x] **josh** — DX review (COMMENT — addressed below)
- [x] **pm** — Scope review (APPROVED with comments — addressed below)
- [x] **nora** — Technical feasibility (REQUEST CHANGES — addressed below)

---

## 1. API Surface

### 1.1 `defineRoutes()` preserves literal keys

```tsx
// BEFORE: literal keys erased → RouteDefinitionMap = { [pattern: string]: RouteConfig }
const routes = defineRoutes({ '/tasks/:id': { component: ... } });

// AFTER: const generic preserves literal keys (zero API change for the developer)
const routes = defineRoutes({ '/tasks/:id': { component: ... } });
// typeof routes carries the literal path keys via TypedRoutes<T> phantom generic
```

No developer-facing change — the function signature changes internally to capture `const T`.

### 1.2 `createRouter()` returns `Router<T>`

```tsx
const router = createRouter(routes);
// router is Router<{ '/': ..., '/tasks/:id': ..., '/settings': ... }>

router.navigate('/tasks/42');         // OK — matches `/tasks/${string}`
router.navigate('/nonexistent');      // Type error!
```

### 1.3 `useRouter<T>()` — backward-compatible typed access

```tsx
// Untyped (backward compat — works everywhere):
const router = useRouter();
router.navigate('/anything'); // string — no validation

// Typed (opt-in via type parameter):
const router = useRouter<typeof routes>();
router.navigate('/tasks/42');     // OK
router.navigate('/nonexistent');  // Type error!
```

**Recommended pattern for apps:** Export a typed wrapper from the routes file:

```tsx
// router.ts
export const routes = defineRoutes({ ... });
export const appRouter = createRouter(routes);

// Re-export a typed useRouter for the app
export type AppRoutes = typeof routes;
export function useAppRouter() {
  return useRouter<AppRoutes>();
}
```

This avoids `import type { routes }` in every component — pages import `useAppRouter()` instead. This pattern is documented in `ui-components.md` and shown in the task-manager example.

### 1.4 `useParams<TPath>()` — typed param accessor

```tsx
export function TaskDetailPage() {
  const params = useParams<'/tasks/:id'>();
  // params: { id: string } — fully typed!
  console.log(params.id);   // OK
  console.log(params.name); // Type error!
}
```

**Why a string literal type parameter?** You pass the route pattern so TypeScript knows which params to expect. Think of it as telling the compiler "I am rendering inside the `/tasks/:id` route" — it then gives you `{ id: string }` back. This is a developer assertion, not compiler inference. The type system guarantees correctness as long as the developer passes the right path literal.

### 1.5 Typed Link

```tsx
// createLink becomes generic — href validated against route paths
const Link = createLink<typeof routes>(currentPath, navigate);

Link({ href: '/tasks/42', children: 'View' });     // OK
Link({ href: '/nonexistent', children: 'Bad' });    // Type error!
```

## 2. Manifesto Alignment

**Compile-time over runtime:** This is the core principle at play. Route path validation moves from runtime (404 when navigating to a mistyped path) to compile-time (TypeScript rejects the typo). If it builds, it navigates correctly.

**Explicit over implicit:** `useParams<'/tasks/:id'>()` makes the developer explicitly declare which route they're in. No magic inference that could break silently.

**One way to do things:** There's one way to define routes (`defineRoutes`), one way to navigate (`router.navigate`), and one way to read params (`useParams`). Type safety follows the same path — no parallel typed/untyped APIs.

**LLM-first:** Type-safe routes mean the LLM gets immediate compiler feedback on navigation errors. A typo in `navigate('/taks/42')` is caught at build, not after manual testing. This directly serves the north star: "My LLM nailed it on the first try."

### Alternatives considered and rejected

**TanStack-style module augmentation (`declare module '@vertz/ui' { interface Register { router: typeof router } }`):** Eliminates the need to pass type parameters to `useRouter`, `createLink`, etc. — types flow globally after a one-time registration. Rejected because: (1) it relies on ambient module augmentation which is implicit magic, violating "explicit over implicit"; (2) it introduces global state at the type level which is harder for LLMs to reason about; (3) a missing `Register` declaration silently degrades to untyped, which is the exact failure mode we want to prevent.

**Codegen-based typing (Next.js / React Router v7 pattern):** Generate `.d.ts` files from route definitions. Provides automatic typing with zero manual annotation. Rejected because: (1) requires a build plugin / CLI step, adding toolchain complexity; (2) generated files can go stale if the generator isn't run; (3) vertz's "zero-config" philosophy means type safety should work with pure TypeScript, no codegen.

**Automatic `useParams()` inference from route context:** RouterView could thread the matched pattern type into the component factory, making `useParams()` automatically infer the correct params without a type parameter. Rejected because: (1) requires the component factory signature to carry the route pattern as a generic (`component: <TPath>() => Node`), which is a much larger change to the route definition API; (2) breaks the current `() => Node` factory signature; (3) the explicit type parameter aligns with "explicit over implicit" and is simpler to implement correctly.

## 3. Non-Goals

- **Runtime path validation** — this is purely a compile-time feature. Invalid paths still work at runtime (they just won't match). TypeScript catches the mistake, not the router.
- **Typed loader data on `Router`** — `loaderData` remains `Signal<unknown[]>`. In vertz, data fetching is handled at the component level via `query()`, not at the router level. The loader mechanism exists for pre-fetching but `query()` is the primary data access pattern. Both TanStack Router and React Router v7 type loader data, but their loaders are the primary data fetching mechanism — in vertz, `query()` serves that role. Typing loader data requires knowing which route is currently matched (runtime discriminant). Deferred — and may not be needed given the `query()` pattern.
- **Typed search params on `Router`** — search params are validated per-route via `searchParams` schema on `RouteConfig`. The router-level `searchParams` signal remains `Record<string, unknown>`. TanStack Router's `validateSearch` is the gold standard here. A future enhancement could type search params per-route, but it's orthogonal to this feature's scope.
- **Pattern+params navigate overload** — `navigate('/tasks/:id', { params: { id: '42' } })` adds API complexity. Template literal types already catch most mistakes with the string-only approach. Can be added as a non-breaking overload later.
- **Changing `CompiledRoute[]` runtime type** — the runtime still returns `CompiledRoute[]`. The type metadata is carried via phantom generics on `Router<T>`.
- **Nested route type safety** — `RouteConfig.children` uses `RouteDefinitionMap` (wide type), so nested route keys are NOT preserved by `const T`. Making nested routes type-safe would require a recursive generic on `RouteConfig` (`children?: TChildren`) and a recursive `RoutePaths` that walks children. This is significant complexity. Nested route type safety is deferred to a follow-up — the current design covers flat route maps, which is what the task-manager example and most vertz apps use.
- **Link API simplification (#569)** — #569 asks for `createLink` to use `useRouter()` internally, eliminating the manual `currentPath` signal wiring. This design only adds type-safe `href` to the existing `createLink` API. #569 remains a separate follow-up.
- **Param validation/parsing at the route level** — TanStack Router supports `params.parse()` to transform `{ id: string }` to `{ id: number }`. Vertz params are always strings; parsing is left to the component. This could be a future enhancement on `RouteConfig`.

## 4. Unknowns

### 4.1 `const` generic modifier support — **Resolved (discussion)**

TypeScript 5.0+ supports `const` type parameters to infer literal types. Verified: vertz uses TypeScript 5.x. `const T` in `defineRoutes<const T>()` is standard and well-supported.

### 4.2 `PathWithParams<string>` fallback behavior — **Resolved (discussion)**

When `T = RouteDefinitionMap` (the default), `keyof T` is `string`. `PathWithParams<string>` must evaluate to `string` for backward compatibility. Verified: `string` does NOT match template literal conditional patterns (`string extends \`\${infer Before}:\${string}\`` is `false`), so all branches fall through to the base case, returning `string`. Therefore `RoutePaths<RouteDefinitionMap>` = `string`. Locked down by a type test.

### 4.3 `useParams` implementation path — **Resolved (discussion)**

`useParams<TPath>()` reads `router.current.value?.params` and casts to `ExtractParams<TPath>`. The type parameter is a developer assertion (like React Router's `useParams`). The runtime doesn't validate it — the type system guarantees correctness at the call site if the developer passes the right path literal.

### 4.4 Contravariance at the context boundary — **Resolved (design change)**

**Problem (identified by nora):** `Router<T>` has `navigate: (url: RoutePaths<T>) => Promise<void>`. When `T` is a specific route map, `RoutePaths<T>` is a narrow union (e.g., `'/' | '/tasks/${string}'`). `RouterContext` stores `Router` (= `Router<RouteDefinitionMap>`) which has `navigate: (url: string) => Promise<void>`. Due to function parameter contravariance, `Router<MyRoutes>` is NOT assignable to `Router<RouteDefinitionMap>` — a function accepting a narrow union cannot satisfy a type expecting a function accepting `string`.

**Solution: Split typed navigate from the stored Router interface.**

The `Router` interface keeps `navigate: (url: string) => Promise<void>` — it is always the runtime type stored in context. Type safety is provided by a separate `TypedRouter<T>` type that narrows `navigate`:

```ts
/** Runtime Router interface — stored in context, always accepts string. */
export interface Router {
  current: Signal<RouteMatch | null>;
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  // ... other fields unchanged
}

/** Typed Router — narrows navigate to only valid paths. Phantom type only. */
export type TypedRouter<T extends Record<string, RouteConfig> = RouteDefinitionMap> =
  Omit<Router, 'navigate'> & {
    navigate: (url: RoutePaths<T>, options?: NavigateOptions) => Promise<void>;
  };
```

`createRouter<T>()` returns `TypedRouter<T>`. The `RouterContext` stores `Router` (unchanged). `useRouter()` returns `Router`. `useRouter<T>()` returns `TypedRouter<T>` via cast — this is the opt-in typed access point.

This eliminates the contravariance problem entirely:
- `RouterContext.Provider(router, fn)` — `TypedRouter<T>` IS assignable to `Router` because `TypedRouter<T>` has the same structural shape (all same fields), and `Omit<Router, 'navigate'> & { navigate: (url: narrow) => ... }` is assignable to `Router` since the `navigate` overload satisfies the structural check when storing (the object has a `navigate` property that is a function).

Wait — that's still contravariant. Let me be precise. The fix is simpler: `RouterContext` stores `Router` (wide). `createRouter<T>()` returns `TypedRouter<T>` which is a type-level narrowing. At the `Provider` boundary, we store it as `Router` (the cast is implicit because `TypedRouter<T>` extends `Omit<Router, 'navigate'>`). At the `useRouter<T>()` boundary, we cast back to `TypedRouter<T>`.

The actual solution: **`createRouter()` returns `Router` at runtime but `TypedRouter<T>` at the type level. The `TypedRouter<T>` type uses an overloaded `navigate` that accepts BOTH `RoutePaths<T>` (typed) and `string` (runtime fallback):**

```ts
export type TypedRouter<T extends Record<string, RouteConfig> = RouteDefinitionMap> =
  Omit<Router, 'navigate'> & {
    navigate: {
      (url: RoutePaths<T>, options?: NavigateOptions): Promise<void>;
      (url: string, options?: NavigateOptions): Promise<void>;
    };
  };
```

With the overload, TypeScript resolves to the FIRST matching overload. When the developer writes `router.navigate('/tasks/42')`, it matches `RoutePaths<T>` (first overload). When they write `router.navigate(someVariable)` where `someVariable: string`, it falls through to the second overload. And critically, `TypedRouter<T>` IS assignable to `Router` because the overloaded navigate satisfies `(url: string) => Promise<void>` via the second overload.

### 4.5 `const T extends Record<string, RouteConfig>` constraint conflict — **Needs POC**

**Problem (identified by nora):** `RouteConfig` with default `TPath = string` has `loader: (ctx: { params: ExtractParams<string> }) => ...`. `ExtractParams<string>` evaluates to `Record<string, never>`. A concrete loader accessing `params.id` (type `string`) may not satisfy the constraint because `{ id: string }` doesn't extend `Record<string, never>`.

**Proposed fix:** Use a loose constraint that doesn't constrain the loader's params type:

```ts
/** Loose route config for the defineRoutes constraint — doesn't constrain loader params. */
interface RouteConfigLike {
  component: () => Node | Promise<{ default: () => Node }>;
  loader?: (ctx: { params: Record<string, string>; signal: AbortSignal }) => unknown;
  errorComponent?: (error: Error) => Node;
  searchParams?: SearchParamSchema<unknown>;
  children?: Record<string, RouteConfigLike>;
}

export function defineRoutes<const T extends Record<string, RouteConfigLike>>(
  map: T,
): TypedRoutes<T> { ... }
```

By using `Record<string, string>` (not `Record<string, never>`) in the constraint's loader params, any concrete loader that accesses string params satisfies the constraint.

**Status:** Needs a TypeScript Playground POC to verify this interaction. Will be done in Phase 1 of implementation before writing production code.

## 5. Type Flow Map

```
defineRoutes<const T>()
  ↓ T = { '/': RouteConfig, '/tasks/:id': RouteConfig, ... }
TypedRoutes<T> (branded CompiledRoute[] carrying phantom T)
  ↓ [assignable to CompiledRoute[] — brand stripped at matchRoute boundary]
createRouter<T>(routes: TypedRoutes<T>) → TypedRouter<T>
  ↓ [TypedRouter<T> assignable to Router via navigate overload]
RouterContext.Provider(router)  ← stores as Router (type erased)
  ↓
useRouter() → Router (untyped, backward compat)
useRouter<T>() → TypedRouter<T> (typed, opt-in cast)
  ↓
TypedRouter<T>.navigate(url: RoutePaths<T>)  ← typed navigate (first overload)
TypedRouter<T>.current → Signal<RouteMatch | null>
  ↓
useParams<TPath>() → ExtractParams<TPath>
  ↓ [TPath is DISCONNECTED from T — developer assertion, not compiler-verified]
createLink<T>() → Link with href: RoutePaths<T>  ← typed href
```

**Erasure boundaries (explicitly marked):**
1. `TypedRoutes<T>` → `CompiledRoute[]` — when passed to `matchRoute()` or any function expecting `CompiledRoute[]`, the phantom `T` is erased
2. `TypedRouter<T>` → `Router` — at the `RouterContext.Provider` boundary, the generic is erased to the wide `Router` type
3. `Router` → `TypedRouter<T>` — at `useRouter<T>()`, the generic is restored via unsafe cast (developer assertion)
4. `useParams<TPath>()` — `TPath` is a standalone type parameter unconnected to `T` from the route map. Correctness depends on the developer passing the right path literal.

**Each flow step has a `.test-d.ts` acceptance criterion:**

| Flow step | Positive test | Negative test |
|-----------|--------------|---------------|
| `PathWithParams<'/tasks/:id'>` | equals `` `/tasks/${string}` `` | — |
| `PathWithParams<'/files/*'>` | equals `` `/files/${string}` `` | — |
| `PathWithParams<string>` | equals `string` (backward compat) | — |
| `RoutePaths<T>` | `'/tasks/42'` extends `RoutePaths<T>` | `'/nonexistent'` does not extend `RoutePaths<T>` |
| `defineRoutes<const T>()` | preserves literal key `'/tasks/:id'` | — |
| `TypedRoutes<T>` assignable to `CompiledRoute[]` | compiles | — |
| `createRouter<T>()` | returns `TypedRouter<T>` | — |
| `TypedRouter<T>.navigate()` | accepts `'/tasks/42'` | rejects `'/nonexistent'` |
| `TypedRouter<T>` assignable to `Router` | compiles (context boundary) | — |
| `useRouter()` (no param) | returns `Router` (accepts any string) | — |
| `useRouter<T>()` | returns `TypedRouter<T>` | — |
| `useParams<'/tasks/:id'>()` | returns `{ id: string }` | rejects `.name` access |
| `createLink<T>()` href | accepts `'/tasks/42'` | rejects `'/nonexistent'` |

## 6. Key Type Utilities

### `PathWithParams<T>` — converts pattern to accepted URL shapes

```ts
// '/tasks/:id'                   → `/tasks/${string}`
// '/'                            → '/'
// '/settings'                    → '/settings'
// '/users/:id/posts/:postId'     → `/users/${string}/posts/${string}`
// '/files/*'                     → `/files/${string}`
// '/:slug'                       → `/${string}`
type PathWithParams<T extends string> =
  T extends `${infer Before}*`
    ? `${Before}${string}`
    : T extends `${infer Before}:${string}/${infer After}`
      ? `${Before}${string}/${PathWithParams<`/${After}`>}`
      : T extends `${infer Before}:${string}`
        ? `${Before}${string}`
        : T;
```

Note: wildcard (`*`) branch is checked first, before `:param` branches.

### `RoutePaths<T>` — union of all valid URL shapes from a route map

```ts
type RoutePaths<T> = {
  [K in keyof T & string]: PathWithParams<K>;
}[keyof T & string];

// For { '/': ..., '/tasks/:id': ..., '/settings': ... }
// Produces: '/' | `/tasks/${string}` | '/settings'
```

### `TypedRoutes<T>` — branded array carrying phantom route map

```ts
export type TypedRoutes<T extends Record<string, RouteConfigLike> = RouteDefinitionMap> =
  CompiledRoute[] & { readonly __routes: T };
```

The `__routes` property is a phantom — it never exists at runtime. The `defineRoutes` implementation casts the return value: `return routes as TypedRoutes<T>`. This is the ONE acceptable cast point (documented for TDD compliance).

### `TypedRouter<T>` — Router with typed navigate overload

```ts
export type TypedRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap> =
  Omit<Router, 'navigate'> & {
    navigate: {
      (url: RoutePaths<T>, options?: NavigateOptions): Promise<void>;
      (url: string, options?: NavigateOptions): Promise<void>;
    };
  };
```

The dual overload solves the contravariance problem: `TypedRouter<T>` is assignable to `Router` (via the `string` overload), while the first overload provides type-safe path checking at call sites.

## 7. Known Trade-offs

**`useParams<TPath>()` requires the developer to pass the correct path literal.** There's no automatic inference from "which route am I in." This matches React Router's pattern. The risk: if a route is renamed (e.g., `:id` to `:taskId`), `useParams<'/tasks/:id'>()` calls across the codebase become stale — TypeScript won't catch the drift because `TPath` is disconnected from the route map. **Mitigation:** use find-and-replace when renaming route patterns. A lint rule that validates `useParams<T>()` literals against the app's route definitions is a future enhancement.

**Backward compatibility via default type parameters.** `Router` (no generic) keeps `navigate: (url: string) => Promise<void>`. `TypedRouter<T>` narrows `navigate` via overload. Existing code compiles without changes. Type safety is opt-in via `createRouter()` return type inference or `useRouter<T>()`.

**`CompiledRoute[]` stays untyped at runtime.** The generic `T` on `TypedRouter<T>` is a phantom — it exists only at the type level. The actual `routes` parameter is still `CompiledRoute[]` at runtime. This is the same pattern as the backend's phantom types on `ColumnBuilder`.

**Type erasure at context boundary is intentional.** `RouterContext` stores `Router` (wide type). `useRouter<T>()` casts back to `TypedRouter<T>`. The developer can pass a wrong `T` and TypeScript won't catch it — this is the same trade-off React Router makes. The recommended pattern (export `useAppRouter()` from the routes file) reduces this risk by centralizing the type parameter.

**Error messages for large route maps.** When TypeScript rejects a path like `navigate('/taks/42')`, the error shows the full union of valid paths. For apps with 40+ routes, this can be verbose. This is inherent to TypeScript's template literal union errors. We accept this trade-off — the error is always correct, just potentially long.

**`isolatedDeclarations` impact on userland.** If a user's project also uses `isolatedDeclarations` and they `export const routes = defineRoutes({...})`, they'll need an explicit type annotation. This is a TypeScript requirement, not a vertz limitation. Documented in examples.

**View Transitions still absent.** RouterView doesn't support View Transitions yet (#567). This feature doesn't change that — it's orthogonal.

## 8. Prior Art Comparison

### TanStack Router — Gold standard for type-safe routing

TanStack Router achieves full type safety via module augmentation (`Register` pattern). Once registered, every `<Link>`, `useParams()`, `useSearch()`, and `navigate()` is automatically typed without manual type parameters. It supports typed search params via `validateSearch` with schema validation, typed loader data via inferred `useLoaderData()`, and full nested route type inheritance. File-based routing requires a Vite plugin; code-based routing needs only the `Register` declaration.

**Key difference:** TanStack's `useParams({ from: '/posts/$postId' })` uses a runtime `from` parameter that TypeScript validates. Vertz's `useParams<'/tasks/:id'>()` uses a type-level parameter. Both are explicit; TanStack's is validated against the registered router, vertz's is a developer assertion.

### React Router v7 / Remix — Codegen-scoped type safety

RR v7 generates `+types/*.d.ts` files for each route module. Typed params and loader data are available within route modules via `Route.ComponentProps`. However: standalone `useParams()` remains `Record<string, string | undefined>` (untyped), `<Link to>` is NOT type-checked (accepts `string`), and type safety only works in file-based framework mode with a Vite plugin.

### Where vertz stands

| Feature | TanStack | RR v7 | Vertz (proposed) |
|---------|----------|-------|-------------------|
| Typed navigate | Yes (global) | No | Yes (via `TypedRouter<T>`) |
| Typed params | Yes (inferred) | Module-scoped only | Yes (explicit `useParams<T>`) |
| Typed Link href | Yes | No | Yes |
| Build step needed | Optional | Required | **No** |
| Typed loader data | Yes | Yes | N/A — vertz uses `query()` |
| Typed search params | Yes | No | Not in scope (follow-up) |
| Nested route types | Yes | Partial | Not in scope (follow-up) |

**Vertz's differentiator:** Zero-codegen type safety. Pure TypeScript generics and template literal types — no plugins, no generated files, no `Register` augmentation. Type safety flows from `defineRoutes()` with no additional config.

**Why typed loader data is N/A, not a gap:** In vertz, data fetching is handled by `query()` at the component level, not by router loaders. The loader mechanism exists for optional pre-fetching, but `query()` is the primary data access pattern (see task-manager example: `TaskListPage` uses `query(() => fetchTasks())`). Both TanStack and RR v7 treat loaders as the primary data fetching mechanism — different architectural choice. Typed loader data could be added later if the loader pattern becomes more prominent.

## 9. Known Limitations

### 9.1 `useParams` path drift on route rename

When a route pattern changes (e.g., `/tasks/:id` to `/tasks/:taskId`), `useParams<'/tasks/:id'>()` calls across the codebase silently become stale. The `TPath` type parameter is disconnected from the route map — TypeScript cannot verify it matches an actual route.

**Current mitigation:** Find-and-replace when renaming routes. The recommended `useAppRouter()` pattern centralizes the route type, but `useParams` still requires per-call-site literals.

**Future mitigation:** A lint rule that extracts `useParams<T>()` string literals and validates them against the app's `defineRoutes()` call. This is out of scope for this PR but tracked as a follow-up.

### 9.2 Nested route keys not preserved

`RouteConfig.children` is typed as `RouteDefinitionMap` (wide `[pattern: string]`), so `const T` on `defineRoutes` does NOT preserve literal keys in nested children maps. Nested route paths are not type-checked. This is acceptable for v1 — the task-manager example and most vertz apps use flat route maps.

### 9.3 Array spread strips the brand

`[...typedRoutes]` or `typedRoutes.slice()` produces plain `CompiledRoute[]` — the `TypedRoutes<T>` brand is stripped. The only consumer of the branded type should be `createRouter()`, which receives it directly from `defineRoutes()`.

## 10. E2E Acceptance Test

```ts
// packages/ui/src/router/__tests__/type-safe-router.test-d.ts

import type { Router } from '../navigate';
import { createRouter, defineRoutes, useParams, useRouter } from '../public';
import type { TypedRouter } from '../navigate';

// ── Setup: define routes with literal keys ──
const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/users/:userId/posts/:postId': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
  '/files/*': { component: () => document.createElement('div') },
});

const router = createRouter(routes);

// ── Positive: valid paths compile ──
router.navigate('/');
router.navigate('/tasks/42');
router.navigate('/users/1/posts/99');
router.navigate('/settings');
router.navigate('/files/docs/readme.md');

// ── Negative: invalid paths rejected ──
// @ts-expect-error - '/nonexistent' is not a valid route path
router.navigate('/nonexistent');

// @ts-expect-error - '/tasks' without param segment is not valid
router.navigate('/tasks');

// ── useParams typed ──
const params = useParams<'/tasks/:id'>();
const _id: string = params.id; // OK
void _id;

// @ts-expect-error - 'name' does not exist on params for '/tasks/:id'
const _bad = params.name;
void _bad;

// ── Context boundary: TypedRouter assignable to Router ──
const typedRouter: TypedRouter<typeof routes extends { readonly __routes: infer R } ? R : never> = router;
const untypedRef: Router = typedRouter; // Must compile — no contravariance error
void untypedRef;

// ── Backward compat: untyped Router accepts any string ──
declare const untypedRouter: Router;
untypedRouter.navigate('/anything'); // OK — no type error

// ── Wildcard route ──
router.navigate('/files/any/path/here');
```

## 11. Developer Walkthrough

The 5-minute experience for a developer using type-safe routing:

1. **Define routes** — no change from current API:
   ```tsx
   // router.ts
   import { createRouter, defineRoutes } from '@vertz/ui';

   export const routes = defineRoutes({
     '/': { component: () => HomePage() },
     '/tasks/:id': { component: () => TaskDetailPage() },
   });

   export const appRouter = createRouter(routes);
   ```

2. **Navigate** — type errors appear automatically:
   ```tsx
   appRouter.navigate('/tasks/42');     // OK
   appRouter.navigate('/taks/42');      // Type error! Typo caught.
   ```

3. **Read params** — pass the route pattern as a type parameter:
   ```tsx
   import { useParams } from '@vertz/ui';

   export function TaskDetailPage() {
     const { id } = useParams<'/tasks/:id'>();
     // id: string — fully typed
   }
   ```

4. **Optional: typed useRouter in components** — export a typed wrapper:
   ```tsx
   // router.ts (add this)
   import { useRouter } from '@vertz/ui';
   export type AppRoutes = typeof routes;
   export function useAppRouter() {
     return useRouter<AppRoutes>();
   }

   // any-component.tsx
   import { useAppRouter } from '../router';
   const { navigate } = useAppRouter();
   navigate('/tasks/42');     // Typed!
   ```

No codegen. No plugins. No `Register` declarations. Type safety flows from `defineRoutes()`.

## 12. Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/router/params.ts` | Add `PathWithParams<T>`, `RoutePaths<T>` |
| `packages/ui/src/router/define-routes.ts` | Add `RouteConfigLike`, `TypedRoutes<T>`, make `defineRoutes` generic |
| `packages/ui/src/router/navigate.ts` | Add `TypedRouter<T>`, make `createRouter` return `TypedRouter<T>` |
| `packages/ui/src/router/router-context.ts` | Make `useRouter` generic, add `useParams` |
| `packages/ui/src/router/link.ts` | Make `createLink` generic, type `href` |
| `packages/ui/src/router/index.ts` | Export new types |
| `packages/ui/src/router/public.ts` | Export new types |
| `packages/ui/src/index.ts` | Export new types |
| `packages/ui/src/router/__tests__/router.test-d.ts` | Add type tests for all flow steps |
| `packages/ui/src/router/__tests__/router-context.test.ts` | Add runtime tests for `useParams` |
| `packages/ui/src/__tests__/subpath-exports.test.ts` | Update expected exports |
| `examples/task-manager/src/pages/task-detail.tsx` | Use `useParams<'/tasks/:id'>()` |
| `examples/task-manager/src/router.ts` | Type inference flows through |
| `.changeset/*.md` | Patch changeset |
