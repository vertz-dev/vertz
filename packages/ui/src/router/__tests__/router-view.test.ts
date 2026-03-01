import { beforeEach, describe, expect, test } from 'bun:test';
import { onMount } from '../../component/lifecycle';
import { __element, __enterChildren, __exitChildren } from '../../dom/element';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';
import { Outlet } from '../outlet';
import { RouterContext, useRouter } from '../router-context';
import { RouterView } from '../router-view';

describe('RouterView', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('returns an HTMLDivElement', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    expect(view!).toBeInstanceOf(HTMLDivElement);
    router.dispose();
  });

  test('renders matched route sync component', () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          const el = document.createElement('div');
          el.textContent = 'Home';
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    expect(view!.textContent).toBe('Home');
    router.dispose();
  });

  test('renders empty when no route matches and no fallback', () => {
    const routes = defineRoutes({
      '/home': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/nonexistent');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    expect(view!.childNodes.length).toBe(0);
    router.dispose();
  });

  test('renders fallback when no route matches', () => {
    const routes = defineRoutes({
      '/home': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/nonexistent');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        fallback: () => {
          const el = document.createElement('div');
          el.textContent = 'Not Found';
          return el;
        },
      });
    });
    expect(view!.textContent).toBe('Not Found');
    router.dispose();
  });

  test('swaps content when router.current changes', async () => {
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
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    expect(view!.textContent).toBe('Home');
    await router.navigate('/about');
    expect(view!.textContent).toBe('About');
    router.dispose();
  });

  test('resolves async/lazy component', async () => {
    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              const el = document.createElement('div');
              el.textContent = 'Lazy Page';
              return el;
            },
          }),
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(view!.textContent).toBe('Lazy Page');
    router.dispose();
  });

  test('provides RouterContext to sync page components', () => {
    let capturedRouter: ReturnType<typeof useRouter> | undefined;
    const routes = defineRoutes({
      '/': {
        component: () => {
          capturedRouter = useRouter();
          return document.createElement('div');
        },
      },
    });
    const router = createRouter(routes, '/');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    // wrapSignalProps creates a new object, so check behaviour not identity
    expect(capturedRouter).toBeDefined();
    expect(capturedRouter!.navigate).toBe(router.navigate);
    router.dispose();
  });

  test('provides RouterContext to async page components', async () => {
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
    const router = createRouter(routes, '/');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    await new Promise((r) => setTimeout(r, 0));
    // wrapSignalProps creates a new object, so check behaviour not identity
    expect(capturedRouter).toBeDefined();
    expect(capturedRouter!.navigate).toBe(router.navigate);
    router.dispose();
  });

  test('discards stale async component on rapid navigation', async () => {
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
    const router = createRouter(routes, '/slow');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    await router.navigate('/fast');
    expect(view!.textContent).toBe('Fast Page');
    // Resolve the stale component — should NOT replace current content
    resolveFirst!({
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'Stale Page';
        return el;
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(view!.textContent).toBe('Fast Page');
    router.dispose();
  });

  test('page component reads params via useRouter()', () => {
    let capturedId: string | undefined;
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => {
          const router = useRouter();
          capturedId = router.current?.params.id;
          return document.createElement('div');
        },
      },
    });
    const router = createRouter(routes, '/tasks/42');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    expect(capturedId).toBe('42');
    router.dispose();
  });

  test('useRouter works in page after navigation (context scope re-run)', async () => {
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
    const router = createRouter(routes, '/');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    await router.navigate('/about');
    // wrapSignalProps creates a new object, so check behaviour not identity
    expect(capturedOnAbout).toBeDefined();
    expect(capturedOnAbout!.navigate).toBe(router.navigate);
    router.dispose();
  });

  test('page cleanup runs when navigating away', async () => {
    let cleanedUp = false;
    const routes = defineRoutes({
      '/': {
        component: () => {
          onMount(() => {
            return () => {
              cleanedUp = true;
            };
          });
          return document.createElement('div');
        },
      },
      '/other': {
        component: () => document.createElement('div'),
      },
    });
    const router = createRouter(routes, '/');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    expect(cleanedUp).toBe(false);
    await router.navigate('/other');
    expect(cleanedUp).toBe(true);
    router.dispose();
  });

  test('two-level nested route renders parent + child via Outlet', () => {
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
            component: () => {
              const page = document.createElement('div');
              page.textContent = 'Settings Page';
              return page;
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    // Parent layout rendered with child inside Outlet
    expect(view!.querySelector('.dashboard-layout')).not.toBeNull();
    expect(view!.textContent).toContain('Dashboard');
    expect(view!.textContent).toContain('Settings Page');
    router.dispose();
  });

  test('three-level nesting renders root layout + sub-layout + leaf page', () => {
    const routes = defineRoutes({
      '/app': {
        component: () => {
          const root = document.createElement('div');
          root.className = 'root-layout';
          const header = document.createElement('h1');
          header.textContent = 'App';
          root.appendChild(header);
          root.appendChild(Outlet());
          return root;
        },
        children: {
          '/dashboard': {
            component: () => {
              const sub = document.createElement('div');
              sub.className = 'sub-layout';
              const nav = document.createElement('nav');
              nav.textContent = 'Dashboard Nav';
              sub.appendChild(nav);
              sub.appendChild(Outlet());
              return sub;
            },
            children: {
              '/settings': {
                component: () => {
                  const page = document.createElement('div');
                  page.textContent = 'Settings Page';
                  return page;
                },
              },
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/app/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    // All three levels rendered
    expect(view!.querySelector('.root-layout')).not.toBeNull();
    expect(view!.querySelector('.sub-layout')).not.toBeNull();
    expect(view!.textContent).toContain('App');
    expect(view!.textContent).toContain('Dashboard Nav');
    expect(view!.textContent).toContain('Settings Page');
    router.dispose();
  });

  test('navigate between siblings: parent layout stays mounted', async () => {
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
            component: () => {
              const page = document.createElement('div');
              page.textContent = 'Settings';
              return page;
            },
          },
          '/profile': {
            component: () => {
              const page = document.createElement('div');
              page.textContent = 'Profile';
              return page;
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    // Capture the parent layout DOM node
    const layoutEl = view!.querySelector('.dashboard-layout');
    expect(layoutEl).not.toBeNull();
    expect(view!.textContent).toContain('Settings');

    // Navigate to sibling
    await router.navigate('/dashboard/profile');

    // Parent layout is the SAME DOM node (not re-mounted)
    expect(view!.querySelector('.dashboard-layout')).toBe(layoutEl);
    expect(view!.textContent).toContain('Profile');
    expect(view!.textContent).not.toContain('Settings');
    router.dispose();
  });

  test('parent onMount cleanup does NOT run on sibling navigation', async () => {
    let parentCleanedUp = false;
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          onMount(() => {
            return () => {
              parentCleanedUp = true;
            };
          });
          const layout = document.createElement('div');
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => document.createElement('div'),
          },
          '/profile': {
            component: () => document.createElement('div'),
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    expect(parentCleanedUp).toBe(false);

    // Navigate to sibling — parent should NOT be cleaned up
    await router.navigate('/dashboard/profile');
    expect(parentCleanedUp).toBe(false);
    router.dispose();
  });

  test('child cleanup runs on sibling navigation', async () => {
    let childCleanedUp = false;
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = document.createElement('div');
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => {
              onMount(() => {
                return () => {
                  childCleanedUp = true;
                };
              });
              return document.createElement('div');
            },
          },
          '/profile': {
            component: () => document.createElement('div'),
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    expect(childCleanedUp).toBe(false);

    // Navigate to sibling — old child's cleanup should run
    await router.navigate('/dashboard/profile');
    expect(childCleanedUp).toBe(true);
    router.dispose();
  });

  test('navigate to different parent: full re-render', async () => {
    let dashboardCleanedUp = false;
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          onMount(() => {
            return () => {
              dashboardCleanedUp = true;
            };
          });
          const layout = document.createElement('div');
          layout.className = 'dashboard';
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => document.createElement('div'),
          },
        },
      },
      '/about': {
        component: () => {
          const page = document.createElement('div');
          page.textContent = 'About';
          return page;
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    expect(dashboardCleanedUp).toBe(false);

    // Navigate to a completely different route — full re-render
    await router.navigate('/about');
    expect(dashboardCleanedUp).toBe(true);
    expect(view!.textContent).toContain('About');
    expect(view!.querySelector('.dashboard')).toBeNull();
    router.dispose();
  });

  test('RouterContext available in both parent and child components', () => {
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
    // Both get the same navigate function
    expect(parentRouter!.navigate).toBe(router.navigate);
    expect(childRouter!.navigate).toBe(router.navigate);
    router.dispose();
  });

  test('async leaf in nested route renders after resolution', async () => {
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
            component: () =>
              Promise.resolve({
                default: () => {
                  const page = document.createElement('div');
                  page.textContent = 'Async Settings';
                  return page;
                },
              }),
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    // Parent layout renders immediately
    expect(view!.querySelector('.dashboard-layout')).not.toBeNull();
    expect(view!.textContent).toContain('Dashboard');
    // Async child resolves after a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(view!.textContent).toContain('Async Settings');
    router.dispose();
  });

  test('navigate from flat route to nested route', async () => {
    const routes = defineRoutes({
      '/about': {
        component: () => {
          const page = document.createElement('div');
          page.textContent = 'About';
          return page;
        },
      },
      '/dashboard': {
        component: () => {
          const layout = document.createElement('div');
          layout.className = 'dashboard-layout';
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => {
              const page = document.createElement('div');
              page.textContent = 'Settings';
              return page;
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/about');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    expect(view!.textContent).toContain('About');

    // Navigate from flat to nested
    await router.navigate('/dashboard/settings');
    expect(view!.querySelector('.dashboard-layout')).not.toBeNull();
    expect(view!.textContent).toContain('Settings');
    expect(view!.textContent).not.toContain('About');
    router.dispose();
  });

  test('navigate to same nested route is a no-op', async () => {
    let parentRenderCount = 0;
    let childRenderCount = 0;
    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          parentRenderCount++;
          const layout = document.createElement('div');
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/settings': {
            component: () => {
              childRenderCount++;
              const page = document.createElement('div');
              page.textContent = 'Settings';
              return page;
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    RouterContext.Provider(router, () => {
      RouterView({ router });
    });
    expect(parentRenderCount).toBe(1);
    expect(childRenderCount).toBe(1);

    // Navigate to the same route — should be a no-op
    await router.navigate('/dashboard/settings');
    expect(parentRenderCount).toBe(1);
    expect(childRenderCount).toBe(1);
    router.dispose();
  });

  test('hydration does not clear Outlet container on first render', () => {
    // Simulate SSR-rendered DOM:
    // <div> (RouterView container)
    //   <div class="dashboard-layout"> (parent layout)
    //     <h1>Dashboard</h1>
    //     <div> (Outlet container)
    //       <div>Settings Page</div> (child)
    //     </div>
    //   </div>
    // </div>
    const root = document.createElement('div');
    root.innerHTML =
      '<div>' +
      '<div class="dashboard-layout">' +
      '<h1>Dashboard</h1>' +
      '<div><div>Settings Page</div></div>' +
      '</div>' +
      '</div>';

    const routerViewContainer = root.firstChild as HTMLElement;
    const layoutDiv = routerViewContainer.firstChild as HTMLElement;
    const outletContainer = layoutDiv.querySelector('div > div') as HTMLElement;
    const childDiv = outletContainer.firstChild as HTMLElement;

    // Start hydration
    startHydration(root);

    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = __element('div');
          __enterChildren(layout);
          __element('h1');
          // Outlet should claim the outlet container div and NOT clear its children
          const outlet = Outlet();
          __exitChildren();
          return layout;
        },
        children: {
          '/settings': {
            component: () => {
              const page = __element('div');
              return page;
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    endHydration();

    // The Outlet container should be the claimed SSR node (not cleared)
    // The child should still be in the DOM
    expect(view!.textContent).toContain('Dashboard');
    expect(view!.textContent).toContain('Settings Page');
    // The child div is the same SSR node, not a new one
    expect(outletContainer.contains(childDiv)).toBe(true);
    router.dispose();
  });

  test('navigation works after hydration of nested routes', async () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div>' +
      '<div class="dashboard-layout">' +
      '<h1>Dashboard</h1>' +
      '<div><div>Settings Page</div></div>' +
      '</div>' +
      '</div>';

    startHydration(root);

    const routes = defineRoutes({
      '/dashboard': {
        component: () => {
          const layout = __element('div');
          __enterChildren(layout);
          __element('h1');
          const outlet = Outlet();
          __exitChildren();
          return layout;
        },
        children: {
          '/settings': {
            component: () => {
              return __element('div');
            },
          },
          '/profile': {
            component: () => {
              const page = document.createElement('div');
              page.textContent = 'Profile Page';
              return page;
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    endHydration();

    // After hydration, navigate to sibling — reactivity must work
    await router.navigate('/dashboard/profile');
    expect(view!.textContent).toContain('Profile Page');
    router.dispose();
  });

  test('SSR renders nested route content in single pass', () => {
    (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__ = () => true;
    try {
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
              component: () => {
                const page = document.createElement('div');
                page.textContent = 'Settings Page';
                return page;
              },
            },
          },
        },
      });
      const router = createRouter(routes, '/dashboard/settings');
      let view: HTMLElement;
      RouterContext.Provider(router, () => {
        view = RouterView({ router });
      });
      // Both parent layout and child page rendered in single SSR pass
      expect(view!.querySelector('.dashboard-layout')).not.toBeNull();
      expect(view!.textContent).toContain('Dashboard');
      expect(view!.textContent).toContain('Settings Page');
      router.dispose();
    } finally {
      delete (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__;
    }
  });

  test('renders matched route content during SSR (domEffect runs once)', () => {
    // Install SSR context so isSSR() returns true
    (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__ = () => true;
    try {
      const routes = defineRoutes({
        '/': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'SSR Home';
            return el;
          },
        },
      });
      const router = createRouter(routes, '/');
      let view: HTMLElement;
      RouterContext.Provider(router, () => {
        view = RouterView({ router });
      });
      expect(view!.textContent).toBe('SSR Home');
      router.dispose();
    } finally {
      delete (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__;
    }
  });
});
