# Route-Level Error Boundaries

**Issue:** [#1650](https://github.com/vertz-dev/vertz/issues/1650)

## Problem

Every data-fetching route in the Linear clone manually wraps its component in `ErrorBoundary` with a custom `ErrorFallback`:

```tsx
'/projects': {
  component: () => (
    <ErrorBoundary
      fallback={(error, retry) => <ErrorFallback error={error} retry={retry} />}
      children={() => <ProjectsPage />}
    />
  ),
}
```

This pattern is repeated 4+ times. Every Vertz app will need the same thing. The route config already has an `errorComponent` field, but it's not wired up in `RouterView`.

## API Surface

### 1. `DefaultErrorFallback` — framework-provided error UI

Exported from `@vertz/ui` (not `@vertz/ui/components`) because it's a framework-level component, not a theme-provided one. It works without any theme registered.

```tsx
import { DefaultErrorFallback } from '@vertz/ui';

interface ErrorFallbackProps {
  error: Error;
  retry: () => void;
}

function DefaultErrorFallback({ error, retry }: ErrorFallbackProps): HTMLElement;
```

A simple, theme-independent error display with:
- "Something went wrong" heading
- Error message display
- "Try again" button that calls `retry()`
- Styled with `css()` for consistent look without requiring a theme

### 2. `RouterViewProps.errorFallback` — global error boundary for all routes

```tsx
import { DefaultErrorFallback, RouterView } from '@vertz/ui';

RouterView({
  router: appRouter,
  fallback: () => <NotFound />,        // rendered when no route matches (404)
  errorFallback: DefaultErrorFallback,  // wraps ALL routes in ErrorBoundary
});
```

When `errorFallback` is set, every route component is automatically wrapped in `ErrorBoundary` using this fallback. No manual wrapping needed.

> **Note on `fallback` vs `errorFallback`:** `fallback` renders when no route matches (404). `errorFallback` renders when a matched route's component throws. Both props will have JSDoc making this distinction clear. Renaming `fallback` → `notFound` is desirable but out of scope for this PR (it touches all existing RouterView call sites).

### 3. Per-route `errorComponent` override (already in types)

```tsx
const routes = defineRoutes({
  '/admin': {
    component: () => <AdminPage />,
    // Per-route override — takes precedence over global errorFallback
    errorComponent: ({ error, retry }) => <AdminErrorPage error={error} retry={retry} />,
  },
  '/projects': {
    component: () => <ProjectsPage />,
    // Uses global errorFallback from RouterView
  },
});
```

**Signature change:** `errorComponent` changes to use a props object (matching `errorFallback`):
```tsx
// Before (unused, dead code — positional args)
errorComponent?: (error: Error) => Node;

// After (props object — same shape as errorFallback)
errorComponent?: (props: { error: Error; retry: () => void }) => Node;
```

Both `errorFallback` and `errorComponent` share the same signature: `(props: { error: Error; retry: () => void }) => Node`. A developer writes one error fallback component and uses it in either position without modification. This also aligns with the Vertz convention of destructured props for components.

### 4. Linear clone after this change

```tsx
// router.tsx — no more manual ErrorBoundary wrapping
import { DefaultErrorFallback } from '@vertz/ui';

const routes = defineRoutes({
  '/login': { component: () => <LoginPage /> },
  '/': {
    component: () => <ProtectedRoute ... />,
    children: {
      '/': { component: () => <IndexRedirect /> },
      '/projects': { component: () => <ProjectsPage /> },
      '/projects/:projectId': {
        component: () => <ProjectLayout />,
        children: {
          '/': { component: () => <IssueListPage /> },
          '/board': { component: () => <ProjectBoardPage /> },
          '/issues/:issueId': { component: () => <IssueDetailPage /> },
        },
      },
    },
  },
});

// RouterView setup
RouterView({
  router: appRouter,
  fallback: () => <NotFound />,
  errorFallback: DefaultErrorFallback,  // all routes get error boundaries
});
```

## Manifesto Alignment

- **Principle 2 (One way):** Eliminates the need for every app to create its own ErrorFallback and manually wrap routes. One pattern: set `errorFallback` on `RouterView`.
- **Principle 3 (AI-first):** An LLM can add error handling to all routes with a single line. No need to learn the ErrorBoundary wrapping pattern.
- **Principle 1 (If it builds, it works):** The `errorComponent` signature is typed — if you provide it, the types enforce the `{ error, retry }` props shape.

## Non-Goals

- **Themed error component:** `DefaultErrorFallback` uses `css()` with sensible defaults. Theme packages can provide their own styled version, but the framework default works without a theme.
- **Error boundary for layouts:** Layout routes (non-leaf) don't get separate error boundaries. The leaf route's error boundary catches errors from its own component. Layout errors propagate to the nearest parent error boundary.
- **Automatic retry with backoff:** The retry function is manual (user clicks "Try again"). Automatic retry logic belongs in `query()`, not in the error boundary.
- **Error reporting/logging hooks:** Out of scope. Can be added later as a separate feature.
- **Renaming `fallback` → `notFound`:** Good idea but separate concern. JSDoc disambiguation is sufficient for now.

## Unknowns

None identified.

## Wrapping Strategy

### Where ErrorBoundary wraps in RouterView

The wrapping happens inside `buildInsideOutFactory`, around each route's component factory. The chain order is:

```
OutletContext.Provider > ErrorBoundary > route.component()
```

This means:
- A **leaf route error** does NOT take down the parent layout. The parent layout continues rendering, and the error fallback appears in the Outlet area where the leaf content would have been.
- A **layout route error** propagates to the nearest parent error boundary (or to the root).

**Factory chain (per route):**
```
// Before
factory = () => {
  OutletContext.Provider({ childComponent: cs, router }, () => {
    result = parentComponent();
  });
  return result;
};

// After — when errorFallback or route.errorComponent is set
factory = () => {
  OutletContext.Provider({ childComponent: cs, router }, () => {
    result = ErrorBoundary({
      children: () => parentComponent(),
      fallback: (error, retry) => resolvedFallback({ error, retry }),
    });
  });
  return result;
};
```

The `resolvedFallback` is determined per-route: `route.errorComponent ?? props.errorFallback`. If neither is set, no ErrorBoundary wrapping occurs (backward compatible).

### Lazy (async) route components

Lazy routes return `Promise<{ default: () => Node }>`. The `ErrorBoundary` try/catch catches the sync `children()` call, which returns the Promise — this is NOT an error. The actual component `mod.default()` runs later in the `.then()` callback in `RouterView` and `Outlet`.

**Solution:** Add a try/catch inside the `.then()` callback (in both `RouterView.doRender()` and `Outlet`) that invokes the error fallback when `mod.default()` throws. This mirrors what ErrorBoundary does but for the async resolution path:

```ts
result.then((mod) => {
  try {
    node = mod.default();
    // ... append to container
  } catch (thrown) {
    if (resolvedFallback) {
      const error = toError(thrown);
      const fallbackNode = resolvedFallback({ error, retry: () => { /* re-resolve */ } });
      container.appendChild(fallbackNode);
    } else {
      throw thrown; // no fallback configured, propagate
    }
  }
});
```

### Retry and disposal scope

When `retry()` is called from the error fallback, it re-invokes the route's `component()` factory. The retry must:

1. Create a new disposal scope (`pushScope()`) for the retried component's signals/effects
2. Replace the fallback node with the new component's DOM
3. Clean up the old scope if the retry succeeds

The existing `ErrorBoundary.retry()` does a simple `replaceChild` without scope management. For RouterView integration, we wrap the retry function to handle scoping:

```ts
function scopedRetry(children: () => Node, fallbackNode: Node): void {
  const scope = pushScope();
  try {
    const result = children();
    if (fallbackNode.parentNode) {
      fallbackNode.parentNode.replaceChild(result, fallbackNode);
    }
    popScope();
    // Store scope for cleanup on navigation
  } catch {
    // Retry failed — discard scope, keep fallback
    popScope();
    runCleanups(scope);
  }
}
```

### SSR behavior

During SSR, if a route component throws:
- The ErrorBoundary catches it and renders `DefaultErrorFallback` as static HTML
- The retry button is non-functional until hydration completes
- After hydration, clicking retry re-invokes the component in CSR mode (which may succeed)

**`wrapForSSR` child probing (Pass 1):** The speculative `route.component()` calls in `wrapForSSR` (lines 301-319 of router-view.ts) run outside any ErrorBoundary. If a probed route throws during Pass 1, the error propagates. This is acceptable — Pass 1 is for lazy module discovery, and throwing components won't be lazy (they'd fail immediately). If this proves to be an issue, a try/catch can be added to the probing loop, but it's unlikely to trigger.

## Type Flow Map

```
RouterViewProps.errorFallback: (props: { error: Error; retry: () => void }) => Node
  └─► RouterView reads errorFallback, passes to buildInsideOutFactory
        └─► For each matched route:
              ├─ route.errorComponent exists? → use as ErrorBoundary fallback
              └─ route.errorComponent missing? → use errorFallback from props
                    └─► ErrorBoundary({ children: route.component, fallback })
                          └─► on catch: fallback({ error, retry }) → Node

RouteConfig.errorComponent: (props: { error: Error; retry: () => void }) => Node
  └─► defineRoutes compiles to CompiledRoute.errorComponent
        └─► RouterView reads from matched route
              └─► Takes precedence over global errorFallback
```

## E2E Acceptance Test

```tsx
describe('Feature: Route-level error boundaries', () => {
  describe('Given a RouterView with errorFallback set', () => {
    describe('When a route component throws a sync error', () => {
      it('Then renders the error fallback with the error message', () => {});
      it('Then provides a retry button that re-renders the component', () => {});
    });
    describe('When a lazy route component throws after resolution', () => {
      it('Then catches the error and renders the fallback', () => {});
    });
    describe('When a route component renders successfully', () => {
      it('Then renders the component normally without fallback', () => {});
    });
  });

  describe('Given a route with per-route errorComponent', () => {
    describe('When that route throws an error', () => {
      it('Then uses the per-route errorComponent instead of the global fallback', () => {});
    });
  });

  describe('Given a RouterView without errorFallback', () => {
    describe('When a route component throws an error', () => {
      it('Then the error propagates normally (no automatic boundary)', () => {});
    });
  });

  describe('Given nested routes with errorFallback', () => {
    describe('When a leaf route throws but the parent layout is fine', () => {
      it('Then the parent layout remains, only the leaf content shows error fallback', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: DefaultErrorFallback + RouterView wiring

**Files:**
- `packages/ui/src/component/default-error-fallback.tsx` — new component (`.tsx` for JSX/compiler)
- `packages/ui/src/component/index.ts` — export DefaultErrorFallback + ErrorFallbackProps
- `packages/ui/src/index.ts` — re-export
- `packages/ui/src/router/define-routes.ts` — update errorComponent signature to props object
- `packages/ui/src/router/router-view.ts` — wire up errorFallback + errorComponent in buildInsideOutFactory, add lazy route error handling in .then() callbacks
- `packages/ui/src/router/outlet.ts` — add lazy route error handling in .then() callback
- Tests for all of the above

**Acceptance criteria:**
```tsx
describe('Feature: DefaultErrorFallback component', () => {
  describe('Given an error and retry function', () => {
    describe('When DefaultErrorFallback is rendered', () => {
      it('Then displays the error message', () => {});
      it('Then displays a retry button', () => {});
      it('Then calls retry when the button is clicked', () => {});
    });
  });
});

describe('Feature: RouterView errorFallback integration', () => {
  describe('Given RouterView with errorFallback and a route that throws', () => {
    describe('When the route is matched and rendered', () => {
      it('Then catches the error and renders the fallback', () => {});
      it('Then retry re-renders the route component', () => {});
    });
  });
  describe('Given RouterView with errorFallback and a lazy route that throws after resolve', () => {
    describe('When the lazy component is resolved and throws', () => {
      it('Then catches the error and renders the fallback', () => {});
    });
  });
  describe('Given RouterView with errorFallback and a route with errorComponent', () => {
    describe('When the route throws', () => {
      it('Then uses the per-route errorComponent', () => {});
    });
  });
  describe('Given RouterView without errorFallback', () => {
    describe('When a route throws', () => {
      it('Then error propagates (no automatic wrapping)', () => {});
    });
  });
  describe('Given nested routes with errorFallback', () => {
    describe('When a leaf throws but parent layout is fine', () => {
      it('Then parent layout remains, leaf shows error fallback', () => {});
    });
  });
});
```

### Phase 2: Linear clone simplification

**Files:**
- `examples/linear/src/router.tsx` — remove manual ErrorBoundary wrapping, add errorFallback to RouterView setup
- `examples/linear/src/components/error-fallback.tsx` — delete (replaced by DefaultErrorFallback)
- `examples/linear/src/styles/components.ts` — remove errorFallbackStyles if no longer used
- `examples/linear/src/entry.tsx` or wherever RouterView is called — add errorFallback prop

**Acceptance criteria:**
- Linear clone compiles and runs
- Error handling still works (same UX as before)
- No manual ErrorBoundary imports in router.tsx
- `error-fallback.tsx` deleted
