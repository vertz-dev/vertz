# Design Doc: Type-Safe Router — Typed Navigate, Params & Links

**Status:** In Review
**Author:** mike
**Feature:** Type-Safe Router [#572]
**Reviewers:**
- [ ] **josh** — DX review
- [ ] **pm** — Scope review
- [ ] **nora** — Technical feasibility

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

### 1.4 `useParams<TPath>()` — typed param accessor

```tsx
export function TaskDetailPage() {
  const params = useParams<'/tasks/:id'>();
  // params: { id: string } — fully typed!
  console.log(params.id);   // OK
  console.log(params.name); // Type error!
}
```

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

**Tradeoff accepted:** `useParams<TPath>()` requires the developer to pass the correct path literal — there's no automatic inference from "which route am I in." Full inference would require RouterView to thread the matched pattern type into the component factory, which is a much larger change. The explicit type parameter is simpler, matches React Router's pattern, and aligns with "explicit over implicit."

## 3. Non-Goals

- **Runtime path validation** — this is purely a compile-time feature. Invalid paths still work at runtime (they just won't match). TypeScript catches the mistake, not the router.
- **Typed loader data on `Router`** — `loaderData` remains `Signal<unknown[]>`. Typing it requires knowing which route is currently matched, which is a runtime discriminant. Deferred.
- **Typed search params on `Router`** — similar discriminant issue. Deferred.
- **Pattern+params navigate overload** — `navigate('/tasks/:id', { params: { id: '42' } })` adds API complexity. Template literal types already catch most mistakes with the string-only approach. Can be added as a non-breaking overload later.
- **Changing `CompiledRoute[]` runtime type** — the runtime still returns `CompiledRoute[]`. The type metadata is carried via phantom generics on `Router<T>`.

## 4. Unknowns

### 4.1 `const` generic modifier support — **Resolved (discussion)**

TypeScript 5.0+ supports `const` type parameters to infer literal types. Verified: vertz uses TypeScript 5.x. `const T` in `defineRoutes<const T>()` is standard and well-supported.

### 4.2 `PathWithParams<string>` fallback behavior — **Resolved (discussion)**

When `T = RouteDefinitionMap` (the default), `keyof T` is `string`. `PathWithParams<string>` must evaluate to `string` for backward compatibility. Verified: the recursive template literal type base case handles `string` correctly — `string extends \`\${infer Before}:\${string}\`` is `false` in TypeScript, so the base case returns `string` as-is.

### 4.3 `useParams` implementation path — **Resolved (discussion)**

`useParams<TPath>()` reads `router.current.value?.params` and casts to `ExtractParams<TPath>`. The type parameter is a developer assertion (like React's `useParams`). The runtime doesn't validate it — the type system guarantees correctness at the call site if the developer passes the right path literal. This matches the "explicit over implicit" principle.

## 5. Type Flow Map

```
defineRoutes<const T>()
  ↓ T = { '/': RouteConfig, '/tasks/:id': RouteConfig, ... }
TypedRoutes<T> (branded CompiledRoute[] carrying phantom T)
  ↓
createRouter<T>(routes: TypedRoutes<T>) → Router<T>
  ↓
Router<T>.navigate(url: RoutePaths<T>)  ← typed navigate
Router<T>.current → Signal<RouteMatch | null>
  ↓
useRouter<T>() → Router<T>  ← backward compat: useRouter() returns Router (= Router<RouteDefinitionMap>)
  ↓
useParams<TPath>() → ExtractParams<TPath>  ← typed params via explicit path literal
  ↓
createLink<T>() → Link with href: RoutePaths<T>  ← typed href
```

**Each arrow has a corresponding `.test-d.ts` acceptance criterion:**

| Flow step | Positive test | Negative test |
|-----------|--------------|---------------|
| `PathWithParams<'/tasks/:id'>` | equals `` `/tasks/${string}` `` | `'/tasks/:id'` does not equal `'/tasks/:id'` (pattern vs URL) |
| `RoutePaths<T>` | `'/tasks/42'` extends `RoutePaths<T>` | `'/nonexistent'` does not extend `RoutePaths<T>` |
| `defineRoutes<const T>()` | preserves literal key `'/tasks/:id'` | — |
| `TypedRoutes<T>` → `createRouter<T>()` | infers `Router<T>` | — |
| `Router<T>.navigate()` | accepts `'/tasks/42'` | rejects `'/nonexistent'` |
| `useRouter<T>()` | returns `Router<T>` | — |
| `useRouter()` (no param) | returns `Router` (accepts any string) | — |
| `useParams<'/tasks/:id'>()` | returns `{ id: string }` | rejects `.name` access |
| `createLink<T>()` href | accepts `'/tasks/42'` | rejects `'/nonexistent'` |

## 6. Key Type Utilities

### `PathWithParams<T>` — converts pattern to accepted URL shapes

```ts
// '/tasks/:id'                   → `/tasks/${string}`
// '/'                            → '/'
// '/settings'                    → '/settings'
// '/users/:id/posts/:postId'     → `/users/${string}/posts/${string}`
type PathWithParams<T extends string> =
  T extends `${infer Before}:${string}/${infer After}`
    ? `${Before}${string}/${PathWithParams<`/${After}`>}`
    : T extends `${infer Before}:${string}`
      ? `${Before}${string}`
      : T;
```

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
export type TypedRoutes<T extends Record<string, RouteConfig> = RouteDefinitionMap> =
  CompiledRoute[] & { readonly __routes: T };
```

## 7. Known Trade-offs

**`useParams<TPath>()` requires the developer to pass the correct path literal.** There's no automatic inference from "which route am I in." This matches React Router's pattern and is the simplest approach. Full inference would require RouterView to thread the matched pattern type into the component factory, which is a much larger change.

**Backward compatibility via default type parameters.** `Router` (no generic) defaults to `Router<RouteDefinitionMap>`, which means `navigate()` accepts `string`. Existing code compiles without changes. Type safety is opt-in via `createRouter()` return type inference.

**`CompiledRoute[]` stays untyped at runtime.** The generic `T` on `Router<T>` is a phantom — it exists only at the type level. The actual `routes` parameter is still `CompiledRoute[]` at runtime. This is the same pattern as the backend's phantom types on `ColumnBuilder`.

**View Transitions still absent.** RouterView doesn't support View Transitions yet (#567). This feature doesn't change that — it's orthogonal.

## 8. E2E Acceptance Test

```ts
// packages/ui/src/router/__tests__/type-safe-router.test-d.ts

import { createRouter, defineRoutes, useParams, useRouter } from '../public';

// ── Setup: define routes with literal keys ──
const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/users/:userId/posts/:postId': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
});

const router = createRouter(routes);

// ── Positive: valid paths compile ──
router.navigate('/');
router.navigate('/tasks/42');
router.navigate('/users/1/posts/99');
router.navigate('/settings');

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

// ── Backward compat: untyped Router accepts any string ──
declare const untypedRouter: Router;
untypedRouter.navigate('/anything'); // OK — no type error
```
