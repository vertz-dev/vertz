// ===========================================================================
// Nested RouterView Developer Walkthrough — Public API Validation Test
//
// This test validates that a developer can use nested layouts with
// RouterView and Outlet using ONLY public imports from @vertz/ui.
//
// Covers: defineRoutes with children, createRouter, RouterView, Outlet,
// RouterContext, useRouter, layout stability on sibling navigation,
// child cleanup on navigation, async nested components.
//
// Uses only public package imports — never relative imports.
// ===========================================================================

// @vitest-environment happy-dom

import type { Router } from '@vertz/ui';
import {
  createRouter,
  defineRoutes,
  Outlet,
  RouterContext,
  RouterView,
  useRouter,
} from '@vertz/ui';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helper: create a simple DOM element with text content
// ---------------------------------------------------------------------------
function el(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

describe('Nested RouterView Walkthrough', () => {
  // ── 1. Outlet importable from @vertz/ui ──────────────────────

  it('Outlet and RouterView are importable from @vertz/ui', () => {
    expect(typeof Outlet).toBe('function');
    expect(typeof RouterView).toBe('function');
    expect(typeof defineRoutes).toBe('function');
    expect(typeof createRouter).toBe('function');
  });

  // ── 2. Nested route renders parent layout + child page ───────

  it('renders nested route with parent layout and child page via Outlet', () => {
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = document.createElement('div');
          layout.className = 'dashboard-layout';
          const header = document.createElement('h1');
          header.textContent = 'Dashboard';
          layout.appendChild(header);
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/': {
            component: () => el('div', 'Index Page', 'index-page'),
          },
          '/settings': {
            component: () => el('div', 'Settings Page', 'settings-page'),
          },
        },
      },
      '/about': {
        component: () => el('div', 'About Page', 'about-page'),
      },
    });

    const router = createRouter(routes, '/dashboard/settings');
    let view!: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    // Parent layout rendered with child inside Outlet
    expect(view.querySelector('.dashboard-layout')).not.toBeNull();
    expect(view.textContent).toContain('Dashboard');
    expect(view.textContent).toContain('Settings Page');
    router.dispose();
  });

  // ── 3. Layout stability on sibling navigation ────────────────

  it('parent layout stays mounted when navigating between siblings', async () => {
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = document.createElement('div');
          layout.className = 'dashboard-layout';
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => el('div', 'Settings'),
          },
          '/profile': {
            component: () => el('div', 'Profile'),
          },
        },
      },
    });

    // Cast to Router (unparameterized) — RoutePaths doesn't yet generate
    // composed child paths like '/dashboard/profile'. This is a known gap.
    const router: Router = createRouter(routes, '/dashboard/settings');
    let view!: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    // Capture parent DOM node
    const layoutEl = view.querySelector('.dashboard-layout');
    expect(layoutEl).not.toBeNull();
    expect(view.textContent).toContain('Settings');

    // Navigate to sibling
    await router.navigate('/dashboard/profile');

    // Parent layout is the SAME DOM node (not re-mounted)
    expect(view.querySelector('.dashboard-layout')).toBe(layoutEl);
    expect(view.textContent).toContain('Profile');
    expect(view.textContent).not.toContain('Settings');
    router.dispose();
  });

  // ── 4. Full re-render when navigating to different parent ────

  it('fully re-renders when navigating from nested to flat route', async () => {
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = document.createElement('div');
          layout.className = 'dashboard-layout';
          const header = document.createElement('h1');
          header.textContent = 'Dashboard';
          layout.appendChild(header);
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => el('div', 'Settings'),
          },
        },
      },
      '/about': {
        component: () => el('div', 'About Page'),
      },
    });

    const router = createRouter(routes, '/dashboard/settings');
    let view!: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    expect(view.textContent).toContain('Dashboard');
    expect(view.textContent).toContain('Settings');

    // Navigate to flat route
    await router.navigate('/about');

    expect(view.textContent).toContain('About Page');
    expect(view.textContent).not.toContain('Dashboard');
    expect(view.querySelector('.dashboard-layout')).toBeNull();
    router.dispose();
  });

  // ── 5. useRouter() works at all nesting levels ───────────────

  it('useRouter() works in both parent and child components', () => {
    let parentRouter: ReturnType<typeof useRouter> | undefined;
    let childRouter: ReturnType<typeof useRouter> | undefined;

    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          parentRouter = useRouter();
          const layout = document.createElement('div');
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => {
              childRouter = useRouter();
              return document.createElement('div');
            },
          },
        },
      },
    });

    const router = createRouter(routes, '/dashboard/settings');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });

    expect(parentRouter).toBeDefined();
    expect(childRouter).toBeDefined();
    expect(parentRouter!.navigate).toBe(router.navigate);
    expect(childRouter!.navigate).toBe(router.navigate);
    router.dispose();
  });

  // ── 6. Async nested component resolves correctly ─────────────

  it('async leaf component in nested route renders after resolution', async () => {
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = document.createElement('div');
          layout.className = 'dashboard-layout';
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () =>
              Promise.resolve({
                default: () => el('div', 'Async Settings'),
              }),
          },
        },
      },
    });

    const router = createRouter(routes, '/dashboard/settings');
    let view!: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    // Parent renders immediately
    expect(view.querySelector('.dashboard-layout')).not.toBeNull();

    // Async child resolves after a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(view.textContent).toContain('Async Settings');
    router.dispose();
  });
});
