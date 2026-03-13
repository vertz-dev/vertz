# Component Catalog: RouterView Refactor

## Summary

Replace the manual routing in `examples/component-catalog/src/app.tsx` with the declarative `RouterView` + `RouterContext.Provider` pattern that already exists in `@vertz/ui`. Remove all imperative DOM manipulation from `Sidebar`. Remove the monkey-patched `navigate` and manual `popstate` handler.

## API Surface

### Before (manual routing in `App()`)

```tsx
// Monkey-patched navigate
const originalNavigate = appRouter.navigate.bind(appRouter);
appRouter.navigate = ((input) => {
  const result = originalNavigate(input);
  renderRoute(input.to); // manual DOM update
  return result;
}) as typeof appRouter.navigate;

// Manual popstate
window.addEventListener('popstate', () => {
  renderRoute(window.location.pathname);
});

// Manual DOM: mainEl.innerHTML = ''; mainEl.append(renderHome());
```

### After (declarative RouterView)

```tsx
import { RouterView, RouterContext, ThemeProvider } from '@vertz/ui';

export function App() {
  return (
    <div>
      <ThemeProvider theme="light">
        <RouterContext.Provider value={appRouter}>
          <div class={layoutStyles.shell}>
            <Sidebar />
            <div class={`${layoutStyles.main} ${scrollStyles.thin}`} style="overflow-y: auto;">
              <RouterView router={appRouter} fallback={() => <div>Page not found</div>} />
            </div>
          </div>
        </RouterContext.Provider>
      </ThemeProvider>
    </div>
  );
}
```

### Before (imperative Sidebar)

```tsx
function Sidebar() {
  const navLinks = document.createElement('div');
  navLinks.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
  navLinks.append(Link({ href: '/', children: 'Overview', ... }));
  // ... 40+ lines of document.createElement / appendChild
}
```

### After (declarative JSX Sidebar)

```tsx
import { Link } from '@vertz/ui';

function Sidebar() {
  let currentTheme = 'light';

  function toggleTheme() {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    currentTheme = next;
    document.documentElement.setAttribute('data-theme', next);
  }

  const grouped = groupByCategory(componentRegistry);

  return (
    <nav class={layoutStyles.sidebar} aria-label="Component navigation">
      <div class={navStyles.title}>Components</div>
      <div class={navStyles.subtitle}>{componentRegistry.length} themed components</div>
      <div class={scrollStyles.thin} style="flex: 1; min-height: 0; overflow-y: auto;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <Link href="/" className={navStyles.navItem} activeClass={navStyles.navItemActive}>
            Overview
          </Link>
          {categoryOrder.map((cat) => {
            const entries = grouped.get(cat) ?? [];
            if (entries.length === 0) return <span />;
            return (
              <div>
                <div class={navStyles.categoryTitle}>{categoryLabels[cat]}</div>
                {entries.map((entry) => (
                  <Link
                    href={`/${entry.slug}`}
                    className={navStyles.navItem}
                    activeClass={navStyles.navItemActive}
                  >
                    {entry.name}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div
        class={navStyles.themeToggle}
        role="button"
        tabindex="0"
        onClick={toggleTheme}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleTheme();
          }
        }}
      >
        Toggle Theme
      </div>
    </nav>
  );
}
```

### router.ts — simplified

```tsx
// Remove: createLink, computed currentPath
// Keep: defineRoutes, createRouter, routes, appRouter
import { createRouter, defineRoutes } from '@vertz/ui';
import { componentRegistry } from './demos';
import { DemoPage } from './pages/demo';
import { HomePage } from './pages/home';

function buildRoutes() {
  const map: Record<string, { component: () => Node }> = {
    '/': { component: () => HomePage() },
  };
  for (const entry of componentRegistry) {
    map[`/${entry.slug}`] = {
      component: () => DemoPage(entry),
    };
  }
  return defineRoutes(map);
}

export const routes = buildRoutes();
export const appRouter = createRouter(routes);
```

## Manifesto Alignment

- **One way to do things (Principle 2):** The catalog currently uses manual routing while the framework provides `RouterView`. This refactor eliminates the second pattern so there's one way: `RouterView`.
- **AI agents are first-class users (Principle 3):** The imperative DOM construction in Sidebar is harder for LLMs to generate and maintain. Declarative JSX is the pattern an LLM will reach for — this refactor makes the catalog match that expectation.
- **Explicit over implicit (Manifesto):** `RouterContext.Provider` + `RouterView` makes the routing contract explicit. Monkey-patching `navigate` is implicit and fragile.

### What was rejected

- **Layout routes with Outlet:** Could use a layout route wrapping Sidebar + Outlet, but that adds complexity for no benefit in this flat catalog. Keep it simple.
- **Nested routes:** All catalog routes are flat (no nesting). No need for matched chain diffing.

## Non-Goals

- **No changes to `@vertz/ui` framework code.** This only touches the example app.
- **No changes to page components.** `HomePage` and `DemoPage` already use proper JSX.
- **No new features.** Same behavior, same styling, just using the correct framework patterns.
- **No SSR support.** The catalog is client-only. SSR is out of scope.
- **No tests for the example app.** The catalog has no existing test suite and adding one is a separate effort.

### Known deviations carried forward

- **`DemoPage(entry)` function-call pattern:** Route definitions call `DemoPage(entry)` as a function rather than JSX (`<DemoPage entry={entry} />`). This is a pre-existing deviation from ui-components conventions. `DemoPage` takes a `ComponentEntry` arg (not destructured props), so it can't be called via JSX without also refactoring the component signature. Cleaning this up is a separate effort.
- **Theme toggle imperative DOM:** The `toggleTheme()` function uses `document.documentElement.setAttribute('data-theme', next)` which is imperative DOM manipulation. The `ThemeProvider` currently takes a static `theme` prop and doesn't expose a reactive toggle mechanism. Making `ThemeProvider` support runtime theme switching is a framework gap — not in scope for this refactor. The inline `setAttribute` is the pragmatic approach given current framework capabilities.

## Unknowns

None identified. `RouterView` and context-based `Link` are well-tested framework primitives already used in the linear-clone example.

## Type Flow Map

No new generics introduced. The existing type flow:
- `defineRoutes(map)` → `TypedRoutes<T>` → `createRouter(routes)` → `Router<T>`
- `RouterContext.Provider(router, ...)` → `useRouter<T>()` in pages
- Context-based `Link` reads `RouterContext` → calls `router.navigate({ to })` with typed paths

All of this already works. No new type plumbing needed.

## E2E Acceptance Test

Since this is an example app refactoring with no test infrastructure, acceptance is visual:

1. `cd examples/component-catalog && bun run dev`
2. Navigate to `/` — see category grid (same as before)
3. Click a category card — navigates to `/<slug>`, shows demo page
4. Click sidebar links — navigates between demos
5. Click "Overview" — back to home
6. Browser back/forward — works correctly (RouterView handles this)
7. Theme toggle — still toggles dark/light
8. Direct URL load (e.g., `/button`) — shows correct demo page
9. Unknown URL — shows "Page not found" fallback

## Implementation Plan

### Phase 1: Refactor App + Sidebar + router.ts

Single phase — the changes are tightly coupled and small (~100 lines changed).

**Changes:**
1. **`router.ts`** — Remove `createLink`, `computed`, and `Link` export. Keep `routes` and `appRouter`.
2. **`app.tsx`** — Remove `renderHome()`, `renderDemo()`, monkey-patch, popstate handler. Replace with `RouterContext.Provider` + `RouterView`. Rewrite `Sidebar` as pure JSX using context-based `Link` from `@vertz/ui`.
3. **Remove unused imports** — `createLink`, `computed` from router.ts; `ComponentEntry` type from app.tsx (only used by removed `renderDemo`).

**Acceptance Criteria:**
- [ ] `RouterView` renders the correct page component based on URL
- [ ] Context-based `Link` navigates without monkey-patching
- [ ] Sidebar is fully declarative JSX (no `document.createElement`)
- [ ] Theme toggle still works
- [ ] Browser back/forward navigation works
- [ ] No `renderHome()` / `renderDemo()` / `popstate` handler remains
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
