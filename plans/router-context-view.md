# Design Doc: RouterContext + RouterView — Declarative Route Rendering

**Status:** Approved
**Author:** mike (design), CTO (initial plan)
**Feature:** RouterContext + RouterView [#561]
**Reviewers:**
- [x] **josh** — DX review (approved with changes — addressed below)
- [x] **pm** — Scope review (approved with changes — addressed below)
- [x] **nora** — Technical feasibility (approved with changes — addressed below)
- [x] **CTO** — Approved (2026-02-22)

---

## 1. API Surface

### 1.1 RouterContext + useRouter()

RouterContext provides the router instance via the existing context system. `useRouter()` retrieves it with a helpful error if called outside a Provider.

```tsx
// packages/ui/src/router/router-context.ts

import { createContext, useContext } from '../component/context';
import type { Router } from './navigate';

export const RouterContext = createContext<Router>();

export function useRouter(): Router {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useRouter() must be called within RouterContext.Provider');
  }
  return router;
}
```

**Why `useRouter()` (not `router()`):** The `use` prefix signals "this reads from context and has calling-context requirements." It avoids the naming collision `const router = router()` which would shadow the function and fail at runtime. It follows the established convention in `ui-components.md`: *"Always create a convenience `use*` accessor that throws on missing provider."* See Decision Log entry 2026-02-22 for the full rationale.

**Naming categories in @vertz/ui:**
- **Primitives** (creators): `query()`, `form()`, `signal()`, `computed()`, `watch()`, `onMount()`
- **Context accessors** (readers): `useContext()`, `useRouter()`, `useSearchParams()`

**Usage in app setup:**

```tsx
import { RouterContext } from '@vertz/ui';

RouterContext.Provider(appRouter, () => {
  // All children can call useRouter()
});
```

**Usage in page components:**

```tsx
import { useRouter } from '@vertz/ui';

export function TaskListPage() {
  const { navigate } = useRouter();
  // ...
}

export function TaskDetailPage() {
  const router = useRouter();
  const taskId = router.current.value?.params.id ?? '';
  // ...
}
```

> **DX note:** `router.current.value?.params.id` is verbose for param access. A `useParams()` convenience accessor is a natural follow-up but is out of scope for this design. Tracked as a future improvement.

### 1.2 RouterView

RouterView is a component that reactively renders the matched route's component. It encapsulates the imperative DOM swapping behind a declarative API.

```tsx
import { RouterView } from '@vertz/ui';

// Inside RouterContext.Provider callback:
RouterContext.Provider(appRouter, () => {
  const main = RouterView({ router: appRouter });
  // main is an HTMLDivElement that reactively renders the matched route
});
```

**Props:**

```tsx
export interface RouterViewProps {
  router: Router;
  fallback?: () => Node;
}

export function RouterView({ router, fallback }: RouterViewProps): HTMLElement;
```

- `router` — The router instance to watch (required)
- `fallback` — Component factory to render when no route matches (optional)

**Why RouterView takes `router` as a prop (not from context):** RouterView is the component that *establishes* the context for child route components. It needs the router instance to both (a) watch `router.current` and (b) wrap component factories in `RouterContext.Provider`. While RouterView is itself called inside a `RouterContext.Provider`, receiving the router explicitly as a prop makes the data flow visible and avoids a circular dependency where the component reading from context is also the one populating it for children.

**Behavior:**

- Returns a `<div>` container element (the same element persists across navigations — only its children are swapped)
- Uses `watch()` on `router.current` to swap content on route change
- Calls the matched route's `component()` factory inside `RouterContext.Provider` so `useRouter()` works during component construction
- Handles async/lazy components (Promise-based) with Provider wrapping in the `.then()` callback
- Discards stale async components via render generation counter
- When `router.current` is `null` and no `fallback` is provided, renders an empty container

**Implementation sketch (async component handling):**

```tsx
watch(
  () => router.current.value,
  (match) => {
    const gen = ++renderGen;
    container.innerHTML = '';

    if (!match) {
      if (fallback) container.appendChild(fallback());
      return;
    }

    // Sync component: wrap in Provider so useRouter() works
    RouterContext.Provider(router, () => {
      const result = match.route.component();

      if (result instanceof Promise) {
        // Async component: .then() runs outside the effect's context scope.
        // A fresh Provider call is needed so useRouter() works in the
        // lazy-loaded component's factory.
        result.then((mod) => {
          if (gen !== renderGen) return; // stale — discard
          RouterContext.Provider(router, () => {
            const node = (mod as { default: () => Node }).default();
            container.appendChild(node);
          });
        });
      } else {
        container.appendChild(result);
      }
    });
  },
);
```

### 1.3 Complete example — app.tsx after rewrite

```tsx
import { RouterContext, RouterView, ThemeProvider, watch } from '@vertz/ui';
import { createSettingsValue, SettingsContext } from './lib/settings-context';
import { appRouter, Link } from './router';
import { layoutStyles } from './styles/components';

export function App() {
  const settings = createSettingsValue();
  const container = <div data-testid="app-root" />;

  SettingsContext.Provider(settings, () => {
    RouterContext.Provider(appRouter, () => {
      const routerView = RouterView({ router: appRouter });
      const main = (
        <main class={layoutStyles.main} data-testid="main-content">
          {routerView}
        </main>
      );

      const shell = (
        <div class={layoutStyles.shell}>
          <nav>...</nav>
          {main}
        </div>
      );

      const themeWrapper = ThemeProvider({
        theme: settings.theme.peek(),
        children: [shell],
      });
      container.appendChild(themeWrapper);

      watch(
        () => settings.theme.value,
        (theme) => {
          themeWrapper.setAttribute('data-theme', theme);
        },
      );
    });
  });

  return container as HTMLElement;
}
```

### 1.4 Page components — no navigate prop

```tsx
// task-list.tsx — BEFORE
export interface TaskListPageProps {
  navigate: (url: string) => void;
}
export function TaskListPage({ navigate }: TaskListPageProps) { ... }

// task-list.tsx — AFTER
import { useRouter } from '@vertz/ui';

export function TaskListPage() {
  const { navigate } = useRouter();
  // ... rest unchanged
}
```

```tsx
// task-detail.tsx — BEFORE
export interface TaskDetailPageProps {
  taskId: string;
  navigate: (url: string) => void;
}
export function TaskDetailPage({ taskId, navigate }: TaskDetailPageProps) { ... }

// task-detail.tsx — AFTER
import { useRouter } from '@vertz/ui';

export function TaskDetailPage() {
  const router = useRouter();
  const { navigate } = router;
  const taskId = router.current.value?.params.id ?? '';
  // ... rest unchanged
}
```

### 1.5 Router.ts — simplified route definitions

```tsx
// BEFORE: every route manually wires navigate
'/': {
  component: () => TaskListPage({
    navigate: (url: string) => appRouter.navigate(url),
  }),
},

// AFTER: pages use useRouter() internally
'/': {
  component: () => TaskListPage(),
},
```

---

## 2. Manifesto Alignment

### Principles applied

| Principle | How this design aligns |
|-----------|----------------------|
| **"One Way to Do Things"** | There is now one way for page components to access navigation: `useRouter()`. No prop threading, no manual wiring, no alternatives. |
| **"Explicit over implicit"** | `useRouter()` makes the dependency on the router explicit at the call site. The `use` prefix signals "this reads from context." The context is set up in a visible `RouterContext.Provider` call — no magic DI. |
| **"My LLM nailed it on the first try"** | `useRouter()` is the universal pattern across React Router, Next.js, Solid Router, Vue Router, TanStack Router. Every LLM knows this pattern. |
| **"Predictability over convenience"** | RouterView does one thing: watches `router.current` and swaps content. No view transitions built in, no error rendering, no loader orchestration. Predictable behavior. |

### Tradeoffs accepted

- **Convention over configuration:** There is exactly one way to get the router in a page component (`useRouter()`), and exactly one way to render routes declaratively (`RouterView`). No alternatives provided.
- **Imperative DOM swapping inside RouterView:** RouterView encapsulates `container.innerHTML = '' / container.appendChild(node)`. This is acceptable because it's framework infrastructure code, not user code. The `ui-components.md` rule explicitly carves out "router page swapping" as acceptable DOM manipulation.

### Alternatives considered and rejected

| Alternative | Why rejected |
|-------------|-------------|
| Keep `navigate` prop on every page | Boilerplate — every route definition repeats `navigate: (url) => appRouter.navigate(url)`. Violates "One Way to Do Things" since pages depend on a prop they shouldn't need. |
| Expose `router` as a module-level singleton | Tightly couples pages to a specific router instance. Prevents testing pages with different router configs. Context is the right pattern. |
| Reactive JSX for route rendering (no DOM swapping) | Would require the compiler to handle dynamic component switching — a much larger feature. RouterView encapsulates the complexity. |
| Name the accessor `router()` (no prefix) | Creates naming collision: `const router = router()` shadows itself. Fails the Manifesto's "LLM nailed it on the first try" test. See Decision Log. |

---

## 3. Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| **Modifying Outlet** | Outlet is for nested route children in layouts. RouterView is for top-level route rendering. Different purposes. |
| **View Transitions API in RouterView** | The current `app.tsx` uses `document.startViewTransition()`. This is a known regression. Will be re-added via a `transition` option. **Follow-up tracked.** |
| **SSR support for RouterView** | RouterView uses `watch()` which is browser-only. SSR uses a different codepath. |
| **Auto-rendering errorComponent** | `current.value` is set before loaders run, so `loaderError` is always `null` when the watch fires. Users handle loader errors via `query()` error states (which is what the examples already do). |
| **`useParams()` convenience accessor** | `router.current.value?.params.id` is verbose but functional. A `useParams()` helper is a natural follow-up but out of scope here. |

---

## 4. Unknowns

No unknowns identified. All building blocks exist and are well-tested:

- `createContext()` / `useContext()` — context system (`packages/ui/src/component/context.ts`)
- `watch()` — fires immediately with current value, runs callback untracked. The effect captures context scope at creation time (`signal.ts:161-168`), so `useContext()` works in re-runs even after the Provider's synchronous callback returns. **Verified by nora** — traced through `EffectImpl._contextScope` capture and `_run()` restoration.
- `Router` interface — exposes `current: Signal<RouteMatch | null>` with `navigate()`, `dispose()` etc. (`packages/ui/src/router/navigate.ts`)
- Route components — `() => Node | Promise<{ default: () => Node }>` (`packages/ui/src/router/define-routes.ts`)

**Auto-NARP (OQ-2 — resolved):** No compiler changes needed. `useRouter()` returns a `Router` object whose signal properties (`current`, `loaderData`, etc.) are accessed via explicit `.value` reads. The `SIGNAL_API_REGISTRY` in `ui-compiler` does not need a `useRouter` entry because the usage pattern differs from `query()`/`form()` auto-unwrapping. **Verified by nora.**

---

## 5. Type Flow Map

```
Router (navigate.ts)
  → createContext<Router>() (router-context.ts) creates RouterContext
  → RouterContext.Provider(router, fn) sets context scope
  → useRouter() (router-context.ts) reads from context → returns Router
  → page component consumer calls useRouter().navigate(), useRouter().current, etc.
```

```
Router (navigate.ts)
  → RouterView({ router }) (router-view.ts) watches router.current
  → router.current: Signal<RouteMatch | null>
  → RouteMatch.route.component: () => Node | Promise<{ default: () => Node }>
  → rendered into HTMLDivElement container
```

No complex generic threading — `Router` is a concrete type, not generic. The type flow is straightforward: `Router` in, `Router` out from `useRouter()`.

**Type test assertions:**
- `useRouter()` returns `Router` — `expectTypeOf(useRouter()).toEqualTypeOf<Router>()`
- `RouterView({ router })` returns `HTMLElement` — `expectTypeOf(RouterView({ router })).toEqualTypeOf<HTMLElement>()`
- `@ts-expect-error`: `RouterView({})` — missing required `router` prop
- `@ts-expect-error`: `RouterView({ router: 'not-a-router' })` — wrong type

---

## 6. E2E Acceptance Test

```tsx
// packages/ui/src/__tests__/router-integration.test.ts

import { describe, expect, it } from 'bun:test';
import { createRouter, defineRoutes, onCleanup, onMount, RouterContext, RouterView, useRouter } from '@vertz/ui';

describe('Feature: RouterContext + RouterView declarative route rendering', () => {
  describe('Given a router with defined routes and RouterContext.Provider', () => {
    describe('When RouterView renders the initial route', () => {
      it('Then the matched route component is rendered in the container', () => {
        const routes = defineRoutes({
          '/': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'Home';
              return el;
            },
          },
        });
        const r = createRouter(routes, '/');
        let view: HTMLElement;
        RouterContext.Provider(r, () => {
          view = RouterView({ router: r });
        });
        expect(view!.textContent).toBe('Home');
        r.dispose();
      });
    });

    describe('When navigating to a different route', () => {
      it('Then RouterView swaps to the new route component', async () => {
        const routes = defineRoutes({
          '/': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'Home';
              return el;
            },
          },
          '/about': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'About';
              return el;
            },
          },
        });
        const r = createRouter(routes, '/');
        let view: HTMLElement;
        RouterContext.Provider(r, () => {
          view = RouterView({ router: r });
        });
        expect(view!.textContent).toBe('Home');
        await r.navigate('/about');
        expect(view!.textContent).toBe('About');
        r.dispose();
      });
    });

    describe('When a page component calls useRouter()', () => {
      it('Then it receives the router instance from context', () => {
        let capturedRouter: ReturnType<typeof useRouter> | undefined;
        const routes = defineRoutes({
          '/': {
            component: () => {
              capturedRouter = useRouter();
              return document.createElement('div');
            },
          },
        });
        const r = createRouter(routes, '/');
        RouterContext.Provider(r, () => {
          RouterView({ router: r });
        });
        expect(capturedRouter).toBe(r);
        r.dispose();
      });
    });

    describe('When useRouter() is called in a page after navigation', () => {
      it('Then the new page component still receives the router from context', async () => {
        let capturedOnAbout: ReturnType<typeof useRouter> | undefined;
        const routes = defineRoutes({
          '/': {
            component: () => document.createElement('div'),
          },
          '/about': {
            component: () => {
              capturedOnAbout = useRouter();
              return document.createElement('div');
            },
          },
        });
        const r = createRouter(routes, '/');
        RouterContext.Provider(r, () => {
          RouterView({ router: r });
        });
        await r.navigate('/about');
        expect(capturedOnAbout).toBe(r);
        r.dispose();
      });
    });

    describe('When a page component reads route params via useRouter()', () => {
      it('Then it receives the correct params from the matched route', () => {
        let taskId: string | undefined;
        const routes = defineRoutes({
          '/tasks/:id': {
            component: () => {
              const router = useRouter();
              taskId = router.current.value?.params.id;
              return document.createElement('div');
            },
          },
        });
        const r = createRouter(routes, '/tasks/42');
        RouterContext.Provider(r, () => {
          RouterView({ router: r });
        });
        expect(taskId).toBe('42');
        r.dispose();
      });
    });

    describe('When useRouter() is called outside RouterContext.Provider', () => {
      it('Then it throws with a descriptive error message', () => {
        expect(() => useRouter()).toThrow(
          'useRouter() must be called within RouterContext.Provider',
        );
      });
    });

    describe('When no route matches and no fallback is provided', () => {
      it('Then RouterView renders an empty container', () => {
        const routes = defineRoutes({
          '/home': {
            component: () => document.createElement('div'),
          },
        });
        const r = createRouter(routes, '/nonexistent');
        let view: HTMLElement;
        RouterContext.Provider(r, () => {
          view = RouterView({ router: r });
        });
        expect(view!.childNodes.length).toBe(0);
        r.dispose();
      });
    });

    describe('When no route matches and a fallback is provided', () => {
      it('Then RouterView renders the fallback', () => {
        const routes = defineRoutes({
          '/home': {
            component: () => document.createElement('div'),
          },
        });
        const r = createRouter(routes, '/nonexistent');
        let view: HTMLElement;
        RouterContext.Provider(r, () => {
          view = RouterView({
            router: r,
            fallback: () => {
              const el = document.createElement('div');
              el.textContent = 'Not Found';
              return el;
            },
          });
        });
        expect(view!.textContent).toBe('Not Found');
        r.dispose();
      });
    });

    describe('When a route uses an async/lazy component', () => {
      it('Then RouterView resolves and renders the component', async () => {
        const routes = defineRoutes({
          '/': {
            component: () =>
              Promise.resolve({
                default: () => {
                  const el = document.createElement('div');
                  el.textContent = 'Lazy Home';
                  return el;
                },
              }),
          },
        });
        const r = createRouter(routes, '/');
        let view: HTMLElement;
        RouterContext.Provider(r, () => {
          view = RouterView({ router: r });
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(view!.textContent).toBe('Lazy Home');
        r.dispose();
      });
    });

    describe('When useRouter() is called inside an async component', () => {
      it('Then it receives the router from the fresh Provider in .then()', async () => {
        let capturedRouter: ReturnType<typeof useRouter> | undefined;
        const routes = defineRoutes({
          '/': {
            component: () =>
              Promise.resolve({
                default: () => {
                  capturedRouter = useRouter();
                  return document.createElement('div');
                },
              }),
          },
        });
        const r = createRouter(routes, '/');
        RouterContext.Provider(r, () => {
          RouterView({ router: r });
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(capturedRouter).toBe(r);
        r.dispose();
      });
    });

    describe('When navigating away before an async component resolves', () => {
      it('Then the stale async component is discarded', async () => {
        let resolveFirst: (value: { default: () => Node }) => void;
        const routes = defineRoutes({
          '/slow': {
            component: () =>
              new Promise<{ default: () => Node }>((resolve) => {
                resolveFirst = resolve;
              }),
          },
          '/fast': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'Fast Page';
              return el;
            },
          },
        });
        const r = createRouter(routes, '/slow');
        let view: HTMLElement;
        RouterContext.Provider(r, () => {
          view = RouterView({ router: r });
        });
        await r.navigate('/fast');
        expect(view!.textContent).toBe('Fast Page');
        // Resolve the stale component — should NOT replace current content
        resolveFirst!({
          default: () => {
            const el = document.createElement('div');
            el.textContent = 'Stale Page';
            return el;
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(view!.textContent).toBe('Fast Page');
        r.dispose();
      });
    });

    describe('When a page component registers onCleanup', () => {
      it('Then cleanup runs when navigating to a different route', async () => {
        let cleanedUp = false;
        const routes = defineRoutes({
          '/': {
            component: () => {
              onMount(() => {
                onCleanup(() => {
                  cleanedUp = true;
                });
              });
              return document.createElement('div');
            },
          },
          '/other': {
            component: () => document.createElement('div'),
          },
        });
        const r = createRouter(routes, '/');
        RouterContext.Provider(r, () => {
          RouterView({ router: r });
        });
        expect(cleanedUp).toBe(false);
        await r.navigate('/other');
        expect(cleanedUp).toBe(true);
        r.dispose();
      });
    });
  });
});
```

---

## 7. Known Trade-offs

| Trade-off | Why acceptable |
|-----------|---------------|
| **RouterView does imperative DOM swapping internally** | Framework infrastructure code, not user code. Encapsulated behind a clean declarative API. `ui-components.md` explicitly allows this. |
| **Container is `<div>`, not `<main>`** | RouterView returns a plain `<div>`. The example's shell wraps it in `<main>` for semantic HTML. Avoids double `<main>` nesting. |
| **View Transitions temporarily lost** | Known regression. The current `app.tsx` uses `document.startViewTransition()`. RouterView does plain DOM swapping. Re-addable via a `transition` option. **Follow-up tracked.** |
| **`currentPath` signal kept for Link compatibility** | `createLink()` takes `ReadonlySignal<string>`, but `router.current` is `Signal<RouteMatch \| null>`. The `currentPath` signal is derived from `router.current` via `watch()`. Simplifying Link's API is a separate concern. **Follow-up tracked.** |
| **`router.current.value?.params.id` is verbose** | Functional but not ergonomic for param access. A `useParams()` convenience accessor is a natural follow-up. |

---

## 8. Follow-ups (tracked)

| Item | Description | Priority |
|------|-------------|----------|
| **View Transitions support** | Add `transition` option to RouterView that uses `document.startViewTransition()` | Should-have |
| **Link API simplification** | Eliminate `currentPath` manual sync — derive from `router.current` internally | Should-have |
| **`useParams()` accessor** | Convenience function for `useRouter().current.value?.params` | Nice-to-have |

---

## 9. Component Lifecycle Clarification

Page components in @vertz/ui are **factory functions** — they run once to produce a DOM tree. When navigating between routes, RouterView calls the new route's `component()` factory from scratch. The previous page's DOM is removed and its cleanups run.

This means: navigating from `/tasks/1` to `/tasks/2` runs the `TaskDetailPage` factory again with new params. It does **not** reactively update params within an existing page instance. This is correct and expected — route params don't change within a page's lifecycle.

---

## Decision Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-02-22 | Use `useRouter()` (with `use` prefix) | josh identified a decisive naming collision: `const router = router()` shadows itself and fails at runtime. LLMs trained on React/Solid/Vue will try `useRouter()` first. The `use` prefix signals "context reader" — a distinct category from creator primitives (`query`, `form`, `signal`). `ui-components.md` already prescribes `use*` for context accessors. | josh (recommended), CTO (approved) |
| 2026-02-22 | RouterView returns `<div>`, not `<main>` | Semantic HTML is the app shell's responsibility. RouterView is a generic container. | CTO |
| 2026-02-22 | View Transitions is a known regression, not a blocker | Can be re-added in a follow-up via `transition` option on RouterView. | CTO |
| 2026-02-22 | No compiler changes needed (OQ-2) | `useRouter()` returns a `Router` object whose signal properties are accessed via explicit `.value` reads. No `SIGNAL_API_REGISTRY` entry needed. | nora (verified) |
| 2026-02-22 | Design Doc sufficient — no PRD needed | Feature is < 1 week, additive API (not breaking), no GTM implications. pm exercised skip authority per `planning-lifecycle.md` Rule 7. | pm |
