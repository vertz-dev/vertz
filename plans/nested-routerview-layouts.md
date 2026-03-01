# Nested RouterView Layouts via Matched Chain + OutletContext [#811]

## Context

RouterView currently renders **only the leaf route** (`match.route.component()` at `router-view.ts:88`), ignoring the `matched[]` chain entirely. The route matching infrastructure already builds the full parent-to-leaf chain (`matchRouteRecursive` in `define-routes.ts:200-242`) and loaders already execute for every matched route (`executeLoaders` in `loader.ts`). The gap is purely in the rendering layer.

**Goal**: When a URL like `/dashboard/settings` matches a nested route tree (`/dashboard` with child `/settings`), RouterView should render the parent layout component with an `<Outlet />` slot that renders the child. Parent layouts must remain stable (not re-mount) when navigating between sibling child routes.

## Manifesto Alignment

- **Explicit over implicit**: Layouts must explicitly render `<Outlet />` where children go. No magic child injection.
- **One way to do things**: `Outlet` is THE mechanism for rendering nested children. No alternative APIs.
- **Compile-time over runtime**: Route nesting is statically defined via `defineRoutes`. The matched chain is computed once per navigation, not per render.

## Non-Goals

- **Named/parallel outlets** (multiple outlet slots in a single layout) — deferred to a future issue
- **Error component rendering** (`errorComponent` on route config is defined but not handled by RouterView today — separate concern)
- **Automatic scroll restoration** — separate concern
- **Route-level guards/middleware** — separate concern
- **View transitions for child-level swaps** — only full page swaps use `withTransition`; child Outlet swaps are immediate

## Unknowns

No unknowns identified. The route matching, loader execution, and scope management primitives are all proven and sufficient. The rendering gap is well-scoped.

## E2E Acceptance Test

```typescript
import { createRouter, defineRoutes, Outlet, RouterContext, RouterView, useRouter } from '@vertz/ui';

// Define nested routes
const routes = defineRoutes({
  '/dashboard': {
    component: () => DashboardLayout(),  // layout calls Outlet()
    children: {
      '/': { component: () => IndexPage() },
      '/settings': { component: () => SettingsPage() },
    },
  },
  '/about': { component: () => AboutPage() },
});

// Render nested route
const router = createRouter(routes, '/dashboard/settings');
RouterContext.Provider(router, () => {
  const view = RouterView({ router });
  // Assert: DashboardLayout rendered, SettingsPage inside Outlet
  expect(view.textContent).toContain('Dashboard');
  expect(view.textContent).toContain('Settings');
});

// Navigate to sibling — layout stays mounted
const dashboardEl = view.querySelector('.dashboard');
await router.navigate('/dashboard');
expect(view.querySelector('.dashboard')).toBe(dashboardEl); // same DOM node
expect(view.textContent).toContain('Index');

// Navigate to flat route — full re-render
await router.navigate('/about');
expect(view.textContent).toContain('About');
expect(view.textContent).not.toContain('Dashboard');
```

---

## Phase 1: Reactive OutletContext + Outlet Component

**Files:**
- `packages/ui/src/router/outlet.ts` — reactive `OutletContext`, standalone `Outlet` component
- `packages/ui/src/router/__tests__/outlet.test.ts` — new tests

### Changes

1. Create a shared module-level `OutletContext` using `createContext()` (replaces the current `createOutlet` pattern where context is passed as a parameter)
2. Remove `createOutlet` and `depth` property (unused, per breaking-changes policy: no backward compat shims)
3. New `OutletContext` interface: `{ childComponent: Signal<(() => Node) | undefined> }`
4. New `Outlet()` component:
   - Reads from shared `OutletContext` via `useContext`
   - Uses `__element('div')` for its container (required for hydration cursor claiming)
   - Uses `__enterChildren`/`__exitChildren` around child rendering (hydration cursor management)
   - Uses `domEffect` to watch `childComponent` signal reactively
   - Wraps factory call in `untrack()` — prevents child signal reads from becoming Outlet dependencies
   - Manages its own `childCleanups` via `pushScope`/`popScope` inside its `domEffect` (mirrors RouterView's scope pattern)
   - Tracks `isFirstHydrationRender` — skips clearing container on first hydration render
   - Returns empty comment when no `OutletContext` is provided (edge case: Outlet used outside router)

### Scope management pattern inside Outlet's domEffect

```typescript
domEffect(() => {
  const factory = ctx.childComponent.value;  // TRACKED: only this signal

  untrack(() => {                            // UNTRACKED: everything else
    runCleanups(childCleanups);
    if (isFirstHydrationRender) {
      isFirstHydrationRender = false;
    } else {
      while (container.firstChild) container.removeChild(container.firstChild);
    }
    childCleanups = pushScope();
    if (factory) {
      const child = factory();
      __append(container, child);
    }
    popScope();
  });
});
```

### TDD Cycles

1. **Outlet returns empty comment when no OutletContext** — `Outlet()` outside any Provider returns a comment node
2. **Outlet renders child component from context** — `OutletContext.Provider` supplies a `childComponent` signal with a factory, `Outlet()` renders it inside a div container
3. **Outlet reactively swaps child when signal changes** — update `childComponent.value` to a new factory, verify container DOM updates
4. **Outlet cleans up previous child scope on swap** — `onMount` cleanup from previous child runs when `childComponent` signal changes
5. **Signal reads inside child do NOT trigger Outlet re-render** — child factory reads a signal during render; that signal changing does not cause Outlet's domEffect to re-run

### Phase integration test
`Outlet()` inside `OutletContext.Provider` with a `signal<(() => Node) | undefined>` renders the child, reactively updates when the signal changes, and cleans up the previous child's scope.

---

## Phase 2: RouterView Nested Rendering (Core)

**Files:**
- `packages/ui/src/router/router-view.ts` — render full matched chain instead of just leaf
- `packages/ui/src/router/__tests__/router-view.test.ts` — nested route tests

### Algorithm: Inside-Out Chain Building

Given `matched = [layout, child, leaf]`, build the component tree inside-out (all inside `untrack()`):

```
1. Start from leaf (last): childFactory = leaf.component
2. Move to child (second-to-last):
   - Create childSignal = signal(childFactory)
   - childFactory = () => {
       OutletContext.Provider({ childComponent: childSignal }, () => {
         return child.component();
       });
     }
3. Move to layout (first):
   - Create childSignal = signal(childFactory)
   - childFactory = () => {
       OutletContext.Provider({ childComponent: childSignal }, () => {
         return layout.component();
       });
     }
4. Render the final childFactory into the container (inside RouterContext.Provider)
```

Each layout component calls `Outlet()` in its JSX, which reads from `OutletContext` and renders the child.

For single-route matches (matched chain length 1), behavior is unchanged — no `OutletContext` involvement, leaf renders directly.

### TDD Cycles

1. **Single-level routes still work** — matched chain of length 1 renders leaf directly (regression test)
2. **Two-level nested route renders parent + child via Outlet** — define routes with `children`, verify parent layout wraps child content
3. **Three-level nesting works** — root layout → sub-layout → leaf page all render correctly
4. **Fallback renders when no match (unchanged)** — no regression
5. **RouterContext available in both parent and child components** — `useRouter()` works at every nesting level

### Phase integration test
`defineRoutes({ '/dashboard': { component: DashboardLayout, children: { '/settings': { component: SettingsPage } } } })` — RouterView renders DashboardLayout with SettingsPage inside Outlet.

---

## Phase 3: Layout Stability on Sibling Navigation

**Files:**
- `packages/ui/src/router/router-view.ts` — matched chain diffing logic
- `packages/ui/src/router/__tests__/router-view.test.ts` — stability tests

### Algorithm: Matched Chain Diffing

On navigation (inside the `domEffect`), compare old `matched[]` with new `matched[]`:

1. Find the **divergence index** — first index where `old[i].route !== new[i].route` (uses object identity on `CompiledRoute` refs, which are created once by `defineRoutes` and reused)
2. **Same route (no divergence)**: no-op for DOM. Loaders still re-run via the router.
3. **Divergence at index 0**: full re-render — existing `runCleanups(pageCleanups)` + `withTransition` + build new inside-out chain
4. **Divergence at index > 0**: build new inside-out chain from `matched[divergeAt:]`, set `levels[divergeAt-1].childSignal.value = newFactory`. Outlet handles cleanup and re-render internally via its own `domEffect`. No `withTransition` for child-level swaps.

**Per-level state** (stored in an array parallel to `matched[]`):
- `route: CompiledRoute` — identity for diffing
- `childSignal: Signal<(() => Node) | undefined>` — updated on navigation (not present for leaf level)

**Scope ownership**: RouterView manages only the outermost level's scope via `pageCleanups` (as it does today). Each Outlet manages its own child's scope via internal `childCleanups`. On full re-render (divergence at 0), `runCleanups(pageCleanups)` destroys the outermost layout including its Outlet's `domEffect`, which cascades cleanup through all nested levels.

**Execution order**: Setting `childSignal.value` inside RouterView's `untrack()` block triggers Outlet's `domEffect` synchronously via recursive scheduler flush. No explicit coordination between RouterView and Outlet is needed.

### TDD Cycles

1. **Navigate between siblings: parent layout stays mounted** — navigate `/dashboard/settings` → `/dashboard/profile`, verify parent DOM node is the same reference
2. **Parent onMount cleanup does NOT run on sibling nav** — parent's cleanup only runs when navigating away from parent entirely
3. **Child cleanup runs on sibling navigation** — old child's onMount cleanup runs before new child renders
4. **Navigate to different parent: full re-render** — `/dashboard/settings` → `/other/page` re-mounts everything
5. **Navigate from nested to flat route** — `/dashboard/settings` → `/about` cleans up all nested scopes
6. **Navigate to same route: no-op** — `/dashboard/settings` → `/dashboard/settings` does not re-mount any component

### Phase integration test
Navigate `/dashboard/settings` → `/dashboard/profile`: DashboardLayout element reference unchanged, SettingsPage cleaned up, ProfilePage rendered in Outlet.

---

## Phase 4: Async/Lazy Components in Nested Routes

**Files:**
- `packages/ui/src/router/router-view.ts` — async handling in chain building
- `packages/ui/src/router/__tests__/router-view.test.ts` — async nested tests

### Changes

Parent and child components can be async (`() => Promise<{ default: () => Node }>`). The inside-out chain building resolves promises and uses the stale `renderGen` guard to discard results from superseded navigations.

### TDD Cycles

1. **Async leaf in nested route** — parent sync, child async → child renders after resolution
2. **Async parent layout** — async parent wraps sync child correctly
3. **Stale async nested component discarded on rapid navigation** — navigate away before async resolves, stale result ignored
4. **Mixed async/sync levels** — 3-level nesting with mix of sync and async

### Phase integration test
Async parent layout + async child: both resolve, Outlet renders child. Rapid navigation discards stale.

---

## Phase 5: SSR + Hydration Compatibility

**Files:**
- `packages/ui/src/router/router-view.ts` — SSR path for nested rendering
- `packages/ui/src/router/__tests__/router-view.test.ts` — SSR/hydration nested tests

### Changes

During SSR (`isSSR()` returns true), `domEffect` runs once synchronously. Nested rendering must work in this single-pass mode. During hydration, Outlet's `__element('div')` claims the SSR-rendered container, and `__enterChildren`/`__exitChildren` manage the cursor for nested node claiming.

### TDD Cycles

1. **SSR renders nested route content in single pass** — with `__VERTZ_IS_SSR__` flag, nested route renders parent + child correctly
2. **Hydration re-attaches reactivity to SSR DOM without clearing** — Outlet with `isFirstHydrationRender` skips clearing on first render, child components claim existing SSR nodes
3. **Hydration cursor balance** — after hydration of nested routes, no unclaimed nodes or unbalanced cursor stack

### Phase integration test
With SSR flag, nested `/dashboard/settings` renders DashboardLayout + SettingsPage in one synchronous pass. Hydration re-attaches reactivity without DOM clearing.

---

## Phase 6: Public API Exports + Walkthrough Integration Test

**Files:**
- `packages/ui/src/router/outlet.ts` — finalize exports
- `packages/ui/src/router/public.ts` — replace `createOutlet` with `Outlet`
- `packages/ui/src/router/index.ts` — replace `createOutlet` with `Outlet`
- `packages/ui/src/index.ts` — replace `createOutlet` with `Outlet`
- `packages/integration-tests/` — walkthrough test with public package imports

### Changes

1. Export `Outlet` from all public barrels
2. Remove `createOutlet` export (breaking change per policy — no backward compat shims)
3. Walkthrough integration test using `@vertz/ui` imports (not relative)

### TDD Cycles

1. **`Outlet` importable from `@vertz/ui`** — integration test imports and uses it
2. **Full walkthrough** — define nested routes → create router → RouterView → verify Outlet renders child → navigate between siblings → verify layout stability

### Phase integration test (walkthrough)
```typescript
import { createRouter, defineRoutes, Outlet, RouterContext, RouterView } from '@vertz/ui';

const routes = defineRoutes({
  '/dashboard': {
    component: () => DashboardLayout(),  // layout calls Outlet()
    children: {
      '/': { component: () => IndexPage() },
      '/settings': { component: () => SettingsPage() },
    },
  },
});
const router = createRouter(routes, '/dashboard/settings');
RouterContext.Provider(router, () => {
  const view = RouterView({ router });
  // Assert: view contains DashboardLayout with SettingsPage in Outlet
});
// Navigate to sibling
await router.navigate('/dashboard');
// Assert: DashboardLayout still mounted, Outlet now shows IndexPage
```

---

## Key Files

| File | Role |
|------|------|
| `packages/ui/src/router/router-view.ts` | Core — extend to render full matched chain |
| `packages/ui/src/router/outlet.ts` | Reactive Outlet + shared OutletContext |
| `packages/ui/src/router/define-routes.ts` | Route matching — already builds `matched[]` chain (no changes) |
| `packages/ui/src/router/navigate.ts` | Router state — already runs loaders for full chain (no changes) |
| `packages/ui/src/runtime/disposal.ts` | `pushScope`/`popScope`/`runCleanups` — reuse for per-level cleanup |
| `packages/ui/src/router/public.ts` | Public barrel — replace `createOutlet` with `Outlet` |
| `packages/ui/src/router/__tests__/router-view.test.ts` | All nested rendering tests |
| `packages/ui/src/router/__tests__/outlet.test.ts` | Reactive Outlet unit tests |

## Existing Utilities to Reuse

- `pushScope()`/`popScope()`/`runCleanups()` from `packages/ui/src/runtime/disposal.ts`
- `signal()` / `domEffect()` from `packages/ui/src/runtime/signal.ts`
- `createContext()` / `useContext()` from `packages/ui/src/component/context.ts`
- `RouterContext.Provider()` — already used in RouterView, reuse at each level
- `__element()`/`__append()`/`__enterChildren()`/`__exitChildren()` from `packages/ui/src/dom/element.ts`
- `untrack()` from `packages/ui/src/runtime/tracking.ts`
- `getIsHydrating()` from `packages/ui/src/hydrate/hydration-context.ts`

## Verification

1. `bun test --filter router` — all router tests pass (existing + new)
2. `bun test --filter outlet` — all outlet tests pass
3. `bun run typecheck --filter @vertz/ui` — clean
4. `bun run typecheck --filter @vertz/integration-tests` — cross-package types pass
5. `bunx biome check --write packages/ui/src/router/` — lint/format clean
6. `bun test` — full test suite green
