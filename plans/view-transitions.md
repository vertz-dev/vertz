# View Transitions API Integration

> **Relationship to `browser-platform-apis.md`:** This doc extracts and supersedes the View Transitions portion (Sub-phase 2) of `plans/browser-platform-apis.md`. The parent doc's View Transitions section should be updated to reference this doc. The Popover API, CSS Anchor Positioning, and Navigation API portions of the parent doc remain separate work.

## Summary

Integrate the browser [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) into the Vertz router. Route navigations optionally wrap DOM updates in `document.startViewTransition()`, producing animated transitions between pages with zero user-side boilerplate beyond a config flag.

**Prerequisite:** This design works with the current History API–based router. The `NavigationBackend` abstraction from `browser-platform-apis.md` is separate work and not a dependency.

## API Surface

### 1. `ViewTransitionConfig` and `RouterOptions.viewTransition`

```typescript
// packages/ui/src/router/view-transitions.ts

/** View transition configuration. */
export interface ViewTransitionConfig {
  /**
   * CSS class name added to <html> during the transition,
   * enabling per-transition CSS animation rules via
   * `.className::view-transition-old(root)` etc.
   *
   * Omit for the default cross-fade.
   */
  className?: string;
}
```

```typescript
// packages/ui/src/router/navigate.ts (additions — existing fields unchanged)

export interface RouterOptions {
  serverNav?: boolean | { timeout?: number };
  _prefetchNavData?: (...) => PrefetchHandle;

  /**
   * Global view transition setting.
   * - true → all navigations use the default cross-fade
   * - ViewTransitionConfig → all navigations use the config
   * - Per-route and per-navigation overrides take precedence
   * - Default: undefined (no transitions)
   */
  viewTransition?: boolean | ViewTransitionConfig;
}
```

### 2. `RouteConfig.viewTransition`

```typescript
// packages/ui/src/router/define-routes.ts (addition — existing fields unchanged)

export interface RouteConfig<TPath, TLoaderData, TSearch, TParams> {
  // ... existing fields ...

  /** Per-route view transition config. Overrides global RouterOptions.viewTransition. */
  viewTransition?: boolean | ViewTransitionConfig;
}
```

### 3. `NavigateOptions.viewTransition` (per-navigation override)

```typescript
// packages/ui/src/router/navigate.ts (addition)

export interface NavigateOptions {
  replace?: boolean;
  params?: Record<string, string>;
  search?: NavigateSearch;

  /** Override view transition for this navigation only.
   *  false explicitly disables even if route/global config enables transitions. */
  viewTransition?: boolean | ViewTransitionConfig;
}
```

**Resolution order:** `navigate().viewTransition ?? route.viewTransition ?? router.viewTransition`

### 4. `withViewTransition()` utility

```typescript
// packages/ui/src/router/view-transitions.ts

/**
 * Wrap a DOM update in a view transition if supported and enabled.
 *
 * Gracefully degrades:
 * - API unsupported → runs update directly
 * - prefers-reduced-motion → runs update directly
 * - config disabled/undefined → runs update directly
 *
 * CSS class cleanup uses an internal generation counter so rapid
 * successive calls don't leak class names from abandoned transitions.
 */
export async function withViewTransition(
  update: () => void | Promise<void>,
  config: ViewTransitionConfig | boolean | undefined,
): Promise<void>;
```

### 5. CSS shorthands

```typescript
// Additions to PROPERTY_MAP in packages/ui/src/css/token-tables.ts
'vt-name': { properties: ['view-transition-name'], valueType: 'raw' },
'view-transition-name': { properties: ['view-transition-name'], valueType: 'raw' },
```

Both the shorthand and full property name are supported. LLMs and developers unfamiliar with the shorthand can use the standard CSS property name.

Usage:
```typescript
css({ hero: ['w:full', 'vt-name:hero-image'] });
// → view-transition-name: hero-image;

// Also valid:
css({ hero: ['w:full', 'view-transition-name:hero-image'] });
```

**Note:** `view-transition-name` values must be unique within a document. Two elements sharing the same name will cause the transition to fail. This is a CSS spec constraint, not a framework limitation — documented in the docs phase.

### 6. Developer usage

```typescript
// Global opt-in (all routes transition)
const router = createRouter(routes, { viewTransition: true });

// Per-route
const routes = defineRoutes({
  '/': { component: () => HomePage() },
  '/about': { component: () => AboutPage(), viewTransition: true },
  '/settings': {
    component: () => SettingsPage(),
    viewTransition: { className: 'slide' },
  },
});

// Per-navigation override (e.g., skip transition after form submit)
router.navigate({ to: '/success', viewTransition: false });

// CSS customization via class name
// When viewTransition: { className: 'slide' }, the 'slide' class is added
// to <html> during the transition, so you can scope animations:
// .slide::view-transition-old(root) { animation: slide-out 200ms; }
// .slide::view-transition-new(root) { animation: slide-in 200ms; }
```

### 7. Shared element transitions (hero animations)

The View Transition API natively supports animating a specific element between two pages. When an element on the old page and an element on the new page share the same `view-transition-name`, the browser morphs between them — animating position, size, and appearance.

No additional framework API is needed. The `vt-name` shorthand (or inline `style`) is the connection mechanism.

**Static shared element** (e.g., a logo that persists across pages):
```tsx
const styles = css({
  logo: ['w:12', 'h:12', 'vt-name:site-logo'],
});

function Header() {
  return <img class={styles.logo} src="/logo.svg" />;
}
```

**Dynamic shared element** (e.g., list item → detail page):
```tsx
// List page — each task gets a unique view-transition-name
function TaskCard({ task }: TaskCardProps) {
  return (
    <div
      class={styles.card}
      style={{ viewTransitionName: `task-${task.id}` }}
    >
      <span class={styles.title}>{task.title}</span>
      <span class={styles.status}>{task.status}</span>
    </div>
  );
}

// Detail page — uses the same view-transition-name for the matched task
function TaskDetailPage() {
  const { id } = useParams<'/tasks/:id'>();

  return (
    <div
      class={styles.detail}
      style={{ viewTransitionName: `task-${id}` }}
    >
      <h1>{task.title}</h1>
      <p>{task.description}</p>
    </div>
  );
}
```

When the user clicks a task in the list, the router navigates with `viewTransition: true`, and the browser smoothly animates the card from its list position to the detail layout.

**Customizing the shared element animation with CSS:**
```css
/* Slow down the morph for task elements */
::view-transition-group(task-*) {
  animation-duration: 300ms;
}

/* Cross-fade the content inside the morphing container */
::view-transition-old(task-*),
::view-transition-new(task-*) {
  animation: none;
  mix-blend-mode: normal;
}
```

**Key constraints:**
- `view-transition-name` must be unique per document — no two visible elements can share the same name at the same time
- The name only needs to match between old page and new page (the browser handles the rest)
- Works with any element type — divs, images, text, SVGs

## Manifesto Alignment

| Principle | How this feature aligns |
|---|---|
| **Predictability over convenience** | View transitions are opt-in (off by default). Existing apps see zero behavior change. |
| **Explicit over implicit** | Developers explicitly enable via `viewTransition: true` on router or per route. No auto-detection. |
| **Progressive enhancement** | Graceful degradation — unsupported browsers, reduced motion, SSR all skip transitions silently. |
| **Composable primitives** | `withViewTransition()` is exported as a standalone utility. Developers can use it outside the router for modals, tabs, etc. |
| **Zero overhead when unused** | No code executes if `viewTransition` is not set. The `withViewTransition()` function short-circuits immediately. |

## Non-Goals

1. **Cross-document (MPA) view transitions** — Only SPA navigations. MPA transitions require `@view-transition` CSS at-rule and Navigation API integration, which is separate work in `browser-platform-apis.md`.
2. **Automatic `view-transition-name` assignment** — Developers set `vt-name` manually via `css()`. No framework magic.
3. **Transition orchestration API** — No `beforeTransition`/`afterTransition` hooks. Use CSS for animation customization.
4. **`<ViewTransition>` component** — Configuration, not rendering. A component wrapper adds no value over the config approach.
5. **Loader-aware transitions** — View transitions wrap only the synchronous DOM swap (signal update), not async loaders. See AD-4.

## Unknowns

### Resolved: Signal updates within `startViewTransition()` callback

**Question:** Does the signal-based DOM update complete synchronously within the `startViewTransition()` callback?

**Resolution:** Yes. The Vertz scheduler uses synchronous batching via a depth counter. When `current.value = match` is set inside the callback:

1. The signal setter calls `_notifySubscribers()` which invokes `batch()`
2. Inside `batch()`, computeds propagate synchronously (always immediate)
3. Effects (including `domEffect` in RouterView) are queued in `pendingEffects`
4. When the outermost `batch()` exits, all queued effects flush synchronously
5. DOM mutations from those effects complete before control returns

The key: effects flush at the end of the `batch()` call, which is still inside the `startViewTransition` callback. No `queueMicrotask` is used in the scheduler's critical path. The DOM mutation completes before the callback returns.

**Evidence:** `packages/ui/src/runtime/scheduler.ts` — `scheduleNotify()` queues effects during batch (line ~30), `batch()` flushes them synchronously on exit (line ~50). No async scheduling. Phase 1 includes a validation test that sets a signal inside `startViewTransition` and verifies the DOM update is synchronous.

**Note:** The original `browser-platform-apis.md` (Unknown 4.1) referenced `queueMicrotask` in the scheduler. The scheduler has since been refactored to use synchronous batching. The concern no longer applies.

### Known Limitation: Lazy route components

Lazy route components (`() => import('./SomePage')`) resolve asynchronously inside RouterView's `domEffect`. When `startViewTransition` wraps the signal update, the lazy import fires but hasn't resolved when the callback returns. The browser captures the "new" snapshot before the lazy component mounts, showing a brief empty state.

**Mitigation:** This matches standard browser behavior — the transition animates to whatever DOM state exists when the callback returns. For routes with lazy components, the transition will show the loading/fallback state transitioning in, then the lazy component appears after. This is acceptable UX and consistent with how other frameworks handle it.

**Future improvement:** A `flush` mechanism that awaits pending lazy components before returning from the transition callback. This is out of scope for this design.

## Type Flow Map

```
NavigateOptions.viewTransition: boolean | ViewTransitionConfig | undefined
  → passed per-call in navigate()
  → highest priority override

RouteConfig.viewTransition: boolean | ViewTransitionConfig | undefined
  → compiled into CompiledRoute.viewTransition
  → accessed via matchRoute() result: match.route.viewTransition

RouterOptions.viewTransition: boolean | ViewTransitionConfig | undefined
  → stored in closure of createRouter()
  → lowest priority fallback

Resolution in navigate():
  navigateInput.viewTransition ?? match.route.viewTransition ?? options.viewTransition
  → passed to withViewTransition(update, resolvedConfig)

Resolution in popstate handler:
  match.route.viewTransition ?? options.viewTransition
  → passed to withViewTransition(update, resolvedConfig)
  (popstate uses target route's config, consistent with forward navigation)
```

No generics involved — `ViewTransitionConfig` is a concrete type. Type test verifies `RouteConfig`, `RouterOptions`, and `NavigateOptions` accept the field and reject invalid values.

## E2E Acceptance Test

```typescript
describe('Feature: View Transitions API integration', () => {
  describe('Given a router with viewTransition: true', () => {
    describe('When navigating to a new route in a browser that supports startViewTransition', () => {
      it('Then calls document.startViewTransition with the DOM update', () => {});
      it('Then the DOM update (route swap) happens inside the transition callback', () => {});
    });

    describe('When navigating in a browser WITHOUT startViewTransition support', () => {
      it('Then the DOM update happens directly without error', () => {});
    });

    describe('When the user prefers reduced motion', () => {
      it('Then the DOM update happens directly without a transition', () => {});
    });
  });

  describe('Given a route with viewTransition: { className: "slide" }', () => {
    describe('When navigating to that route', () => {
      it('Then adds "slide" class to document.documentElement during transition', () => {});
      it('Then removes "slide" class after transition finishes', () => {});
    });
  });

  describe('Given a route with viewTransition: false overriding global viewTransition: true', () => {
    describe('When navigating to that route', () => {
      it('Then skips the view transition', () => {});
    });
  });

  describe('Given navigate() called with viewTransition: false', () => {
    describe('When the route and global config both enable transitions', () => {
      it('Then skips the view transition for this navigation only', () => {});
    });
  });

  describe('Given a view transition is in progress', () => {
    describe('When a second navigation is triggered rapidly', () => {
      it('Then the first transition is abandoned and the second proceeds', () => {});
      it('Then no CSS class name leaks from the abandoned transition', () => {});
    });
  });

  describe('Given a popstate event (back/forward navigation)', () => {
    describe('When viewTransition is enabled globally', () => {
      it('Then wraps the navigation in a view transition', () => {});
      it('Then uses the target route viewTransition config', () => {});
    });
  });

  describe('Given the vt-name CSS shorthand', () => {
    describe('When using css({ hero: ["vt-name:hero-image"] })', () => {
      it('Then generates view-transition-name: hero-image', () => {});
    });
    describe('When using css({ hero: ["view-transition-name:hero-image"] })', () => {
      it('Then also generates view-transition-name: hero-image', () => {});
    });
  });

  describe('Given shared element transitions (hero animations)', () => {
    describe('When a list item has style viewTransitionName: "task-42"', () => {
      describe('And the detail page has a matching viewTransitionName: "task-42"', () => {
        describe('And viewTransition is enabled on the router', () => {
          it('Then the browser morphs the element between list and detail positions', () => {});
        });
      });
    });
  });

  // Type-level tests
  describe('Type: RouteConfig accepts viewTransition field', () => {
    it('allows boolean', () => {});
    it('allows ViewTransitionConfig', () => {});
    // @ts-expect-error — viewTransition must be boolean or ViewTransitionConfig
    it('rejects invalid values', () => {});
  });

  describe('Type: NavigateOptions accepts viewTransition field', () => {
    it('allows boolean', () => {});
    it('allows ViewTransitionConfig', () => {});
  });
});
```

## Implementation Plan

### Phase 1: `withViewTransition()` utility + CSS shorthands

**Scope:** Standalone `withViewTransition()` function with concurrent-transition safety, and `vt-name` / `view-transition-name` property mappings. No router integration yet.

**Files:**
- `packages/ui/src/router/view-transitions.ts` (new)
- `packages/ui/src/router/__tests__/view-transitions.test.ts` (new)
- `packages/ui/src/css/token-tables.ts` (add shorthands)
- `packages/ui/src/css/__tests__/token-tables.test.ts` (test shorthands)

**Acceptance criteria:**
```typescript
describe('Feature: withViewTransition utility', () => {
  describe('Given config is undefined', () => {
    describe('When called with an update function', () => {
      it('Then runs the update directly without startViewTransition', () => {});
    });
  });

  describe('Given config is false', () => {
    describe('When called with an update function', () => {
      it('Then runs the update directly', () => {});
    });
  });

  describe('Given config is true and startViewTransition is supported', () => {
    describe('When called with a sync update function', () => {
      it('Then calls document.startViewTransition with the update', () => {});
      it('Then awaits transition.finished', () => {});
    });
  });

  describe('Given config is true and startViewTransition is NOT supported', () => {
    describe('When called with an update function', () => {
      it('Then runs the update directly (graceful degradation)', () => {});
    });
  });

  describe('Given prefers-reduced-motion is enabled', () => {
    describe('When config is true', () => {
      it('Then runs the update directly without transition', () => {});
    });
  });

  describe('Given config is { className: "slide" }', () => {
    describe('When called with an update', () => {
      it('Then adds "slide" class to documentElement before transition', () => {});
      it('Then removes "slide" class after transition.finished', () => {});
    });
    describe('When transition.finished rejects (e.g., transition abandoned)', () => {
      it('Then still removes the class (cleanup in finally)', () => {});
    });
  });

  describe('Given two rapid calls with { className: "slide" }', () => {
    describe('When the first transition is still in progress', () => {
      it('Then only the second transition class is active after both resolve', () => {});
      it('Then the first transition cleanup does not remove the second class', () => {});
    });
  });
});

describe('Feature: CSS shorthands', () => {
  describe('Given PROPERTY_MAP entries', () => {
    it('vt-name maps to view-transition-name with raw valueType', () => {});
    it('view-transition-name maps to view-transition-name with raw valueType', () => {});
  });
});
```

### Phase 2: Router integration (RouteConfig + RouterOptions + NavigateOptions + navigate/popstate)

**Scope:** Thread `viewTransition` through the type system and wire `withViewTransition()` into the navigation pipeline.

**Files:**
- `packages/ui/src/router/define-routes.ts` (add `viewTransition` to `RouteConfig`, `RouteConfigLike`, `CompiledRoute`)
- `packages/ui/src/router/navigate.ts` (add `viewTransition` to `RouterOptions` and `NavigateOptions`, wrap navigation and popstate)
- `packages/ui/src/router/index.ts` (export `ViewTransitionConfig`)
- `packages/ui/src/router/__tests__/navigate.test.ts` (integration tests)
- `packages/ui/src/router/__tests__/view-transitions-router.test-d.ts` (type tests)

**Integration design:**

The `navigateGen` guard must precede `withViewTransition()` — if a newer navigation started while awaiting prefetch, we must bail out before starting a transition (otherwise we'd capture a DOM snapshot and then do nothing inside the callback).

For `navigate()`:
```typescript
// Inside navigate():
if (gen !== navigateGen) return;
const match = matchRoute(routes, navUrl);
const transitionConfig = input.viewTransition ?? match?.route.viewTransition ?? options?.viewTransition;
await withViewTransition(() => applyNavigation(navUrl, match), transitionConfig);
```

For `popstate`:
```typescript
// Inside onPopState():
const match = matchRoute(routes, popUrl);
const transitionConfig = match?.route.viewTransition ?? options?.viewTransition;
withViewTransition(() => applyNavigation(popUrl, match), transitionConfig).catch(() => {});
```

This requires refactoring `applyNavigation` to accept an optional pre-matched route (to avoid double matching). When called with a match, it skips its own `matchRoute` call.

**View transitions wrap only the signal update (DOM swap), not loaders.** The `applyNavigation` function sets `current.value = match` (triggering RouterView DOM swap) synchronously. Loaders run after the transition completes. This means:
- The transition animates from old page → new page skeleton
- Loaders populate data reactively after the transition
- No frozen old page during slow loaders

**Acceptance criteria:**
```typescript
describe('Feature: Router view transition integration', () => {
  describe('Given createRouter with viewTransition: true', () => {
    describe('When navigate() is called', () => {
      it('Then wraps the route swap in withViewTransition', () => {});
      it('Then the navigateGen guard runs before withViewTransition', () => {});
    });
    describe('When popstate fires (back/forward)', () => {
      it('Then wraps the route swap in withViewTransition', () => {});
      it('Then uses the target route viewTransition config', () => {});
    });
  });

  describe('Given a route with viewTransition: { className: "slide" }', () => {
    describe('When navigating to that route', () => {
      it('Then passes route-level config to withViewTransition', () => {});
    });
  });

  describe('Given route viewTransition: false overriding global true', () => {
    describe('When navigating to that route', () => {
      it('Then skips view transition for that navigation', () => {});
    });
  });

  describe('Given navigate({ to: "/x", viewTransition: false }) with global true', () => {
    describe('When called', () => {
      it('Then skips view transition for this call only', () => {});
    });
  });

  describe('Given no viewTransition config at all', () => {
    describe('When navigate() is called', () => {
      it('Then does not call startViewTransition', () => {});
    });
  });
});

// Type tests
describe('Type: RouteConfig.viewTransition', () => {
  it('accepts true', () => {});
  it('accepts false', () => {});
  it('accepts ViewTransitionConfig', () => {});
  // @ts-expect-error — rejects number
  it('rejects invalid types', () => {});
});

describe('Type: RouterOptions.viewTransition', () => {
  it('accepts true', () => {});
  it('accepts ViewTransitionConfig', () => {});
});

describe('Type: NavigateOptions.viewTransition', () => {
  it('accepts true', () => {});
  it('accepts false', () => {});
  it('accepts ViewTransitionConfig', () => {});
});
```

### Phase 3: Example app integration + docs

**Scope:** Wire view transitions into the task-manager example app (replacing the CSS-only approach with the framework API), add a shared element transition demo (task list → task detail), and document the feature.

**Files:**
- `examples/task-manager/src/app.tsx` (remove manual `viewTransitionsCss` constant)
- `examples/task-manager/src/router.ts` (add `viewTransition: true` to router options)
- `examples/task-manager/src/pages/task-list.tsx` (add dynamic `view-transition-name` to task cards)
- `examples/task-manager/src/pages/task-detail.tsx` (add matching `view-transition-name` to task detail header)
- `packages/mint-docs/` (document view transitions including shared element pattern)

**Acceptance criteria:**
```typescript
describe('Feature: Task-manager example view transitions', () => {
  describe('Given the task-manager app with viewTransition: true on createRouter', () => {
    describe('When navigating between pages', () => {
      it('Then the router config includes viewTransition: true', () => {});
      it('Then the manual viewTransitionsCss constant is removed from app.tsx', () => {});
    });
  });

  describe('Given a task card in the list with view-transition-name: task-{id}', () => {
    describe('When clicking through to the task detail page', () => {
      it('Then the detail page header has the matching view-transition-name: task-{id}', () => {});
      it('Then the browser animates the card to the detail header position (shared element)', () => {});
    });
  });
});

describe('Feature: View Transitions documentation', () => {
  describe('Given the docs package', () => {
    it('Then a view-transitions page exists covering: enabling globally, per-route config, per-navigation override, CSS customization with className, vt-name shorthand, shared element transitions pattern, reduced motion behavior, browser support', () => {});
  });
});
```

---

## Architecture Decision Records

| ID | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| AD-1 | Opt-in via config flag, not auto-enabled | Auto-enable when API available; `<ViewTransition>` component | Predictability — no surprise animations. Config is simpler than a component for a cross-cutting concern. |
| AD-2 | Route-level overrides global; per-navigation overrides route | Global-only; route-only; no per-navigation | Maximum flexibility. Global sets baseline, routes customize, individual navigations can override (e.g., skip transition after form submit). Resolution order is explicit. |
| AD-3 | CSS class via `className` field for custom animations | `enabled: string` dual-purpose field; callback hooks | `className` communicates exactly what it does. No ambiguity about whether the string is a built-in animation name or a CSS class. |
| AD-4 | Wrap only the signal update (DOM swap), not loaders | Wrap everything including loaders; configurable `loaderStrategy` | Wrapping loaders means the old page stays frozen with no loading indicator while loaders run. Wrapping only the signal update gives an immediate animated swap to the new page skeleton, then loaders populate data reactively. This matches developer expectations and avoids the "why isn't my transition animating?" confusion with slow loaders. |
| AD-5 | Both `vt-name` shorthand and `view-transition-name` full name | Shorthand only; full name only | LLMs and developers unfamiliar with the shorthand will try the standard CSS property name first. Supporting both maximizes discoverability. `vt-name` is a convenience for those who know it. |
| AD-6 | Respect `prefers-reduced-motion` unconditionally | Let developers override; ignore preference | Accessibility by default. Developers can still use CSS `@media` for fine-grained control. |
| AD-7 | Generation counter in `withViewTransition` for concurrent transitions | No guard; cancel old transition explicitly | `startViewTransition()` called during an ongoing transition abandons the old one (its `finished` rejects with `AbortError`). The CSS class cleanup in `finally` must not remove a class that a newer transition added. A generation counter ensures only the current transition's cleanup runs. |
| AD-8 | `matchRoute` factored out of `applyNavigation` | Match inside `applyNavigation`; always use global config for popstate | Per-route config for popstate requires knowing the target route before starting the transition. Factoring out `matchRoute` makes config resolution explicit for both forward and back/forward navigation. |

## SSR Safety

The `withViewTransition()` function checks `'startViewTransition' in document` before accessing any browser-only API. The DOM shim (`packages/ui-server/src/dom-shim/index.ts:110`) explicitly excludes `startViewTransition`, so this check returns `false` during SSR. The `document.documentElement.classList` access only runs after this guard, so it never executes in SSR.

Additionally, `createRouter()` returns a lightweight read-only router in non-browser environments (`isBrowser()` check at line 214 of `navigate.ts`), so `navigate()` and `popstate` are never called during SSR.
