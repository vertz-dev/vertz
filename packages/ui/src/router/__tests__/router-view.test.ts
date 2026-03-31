import { beforeEach, describe, expect, test } from 'bun:test';
import { createContext, useContext } from '../../component/context';
import { onMount } from '../../component/lifecycle';
import { __element, __enterChildren, __exitChildren } from '../../dom/element';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { createTestSSRContext, disableTestSSR, enableTestSSR } from '../../ssr/test-ssr-helpers';
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
    await router.navigate({ to: '/about' });
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
    await router.navigate({ to: '/fast' });
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
    await router.navigate({ to: '/about' });
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
    await router.navigate({ to: '/other' });
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
    await router.navigate({ to: '/dashboard/profile' });

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
    await router.navigate({ to: '/dashboard/profile' });
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
    await router.navigate({ to: '/dashboard/profile' });
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
    await router.navigate({ to: '/about' });
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
    await router.navigate({ to: '/dashboard/settings' });
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
    await router.navigate({ to: '/dashboard/settings' });
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
    await router.navigate({ to: '/dashboard/profile' });
    expect(view!.textContent).toContain('Profile Page');
    router.dispose();
  });

  test('SSR renders nested route content in single pass', () => {
    enableTestSSR(createTestSSRContext('/dashboard/settings'));
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
      disableTestSSR();
    }
  });

  test('renders matched route content during SSR (domEffect runs once)', () => {
    enableTestSSR();
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
      disableTestSSR();
    }
  });

  test('SSR Pass 1: lazy parent registers pending components and probes lazy children', () => {
    const ctx = createTestSSRContext('/app/settings');
    enableTestSSR(ctx);
    try {
      const routes = defineRoutes({
        '/app': {
          component: () =>
            Promise.resolve({
              default: () => {
                const layout = document.createElement('div');
                layout.appendChild(Outlet());
                return layout;
              },
            }),
          children: {
            '/settings': {
              component: () =>
                Promise.resolve({
                  default: () => {
                    const page = document.createElement('div');
                    page.textContent = 'Settings';
                    return page;
                  },
                }),
            },
          },
        },
      });
      const router = createRouter(routes, '/app/settings');
      RouterContext.Provider(router, () => {
        RouterView({ router });
      });
      // Pass 1 should have registered both lazy parent and lazy child
      expect(ctx.pendingRouteComponents).toBeDefined();
      expect(ctx.pendingRouteComponents!.size).toBe(2);
      router.dispose();
    } finally {
      disableTestSSR();
    }
  });

  test('SSR Pass 1: lazy parent probes sync children without registering them', () => {
    const ctx = createTestSSRContext('/app/settings');
    enableTestSSR(ctx);
    try {
      const routes = defineRoutes({
        '/app': {
          component: () =>
            Promise.resolve({
              default: () => {
                const layout = document.createElement('div');
                layout.appendChild(Outlet());
                return layout;
              },
            }),
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
      const router = createRouter(routes, '/app/settings');
      RouterContext.Provider(router, () => {
        RouterView({ router });
      });
      // Only the lazy parent should be registered, not the sync child
      expect(ctx.pendingRouteComponents).toBeDefined();
      expect(ctx.pendingRouteComponents!.size).toBe(1);
      router.dispose();
    } finally {
      disableTestSSR();
    }
  });

  test('SSR Pass 2: uses pre-resolved component from resolvedComponents map', () => {
    let rawComponentCalled = false;
    const routes = defineRoutes({
      '/about': {
        component: () => {
          rawComponentCalled = true;
          return Promise.resolve({
            default: () => {
              const el = document.createElement('div');
              el.textContent = 'Lazy About';
              return el;
            },
          });
        },
      },
    });
    const router = createRouter(routes, '/about');
    const compiledRoute = router.current.value!.matched[0]!.route;

    const ctx = createTestSSRContext('/about');
    ctx.resolvedComponents = new Map();
    ctx.resolvedComponents.set(compiledRoute, () => {
      const el = document.createElement('div');
      el.textContent = 'Pre-resolved About';
      return el;
    });
    enableTestSSR(ctx);
    try {
      let view: HTMLElement;
      RouterContext.Provider(router, () => {
        view = RouterView({ router });
      });
      // Pass 2 should use the pre-resolved component, not call the raw lazy one
      expect(rawComponentCalled).toBe(false);
      expect(view!.textContent).toBe('Pre-resolved About');
      router.dispose();
    } finally {
      disableTestSSR();
    }
  });

  test('RouterView cleanup runs on parent scope disposal', () => {
    let pageCleanedUp = false;
    const routes = defineRoutes({
      '/': {
        component: () => {
          onMount(() => {
            return () => {
              pageCleanedUp = true;
            };
          });
          return document.createElement('div');
        },
      },
    });
    const router = createRouter(routes, '/');

    // Create a parent scope so _tryOnCleanup registers the cleanup
    const scope = pushScope();
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });
    popScope();

    expect(view!.textContent).toBeDefined();
    expect(pageCleanedUp).toBe(false);

    // Run parent scope cleanups — triggers _tryOnCleanup which disposes RouterView
    runCleanups(scope);
    expect(pageCleanedUp).toBe(true);
    router.dispose();
  });

  test('hydration with lazy route claims SSR nodes instead of recreating (#1347)', async () => {
    // Simulate SSR-rendered DOM:
    // <div> (RouterView container)
    //   <div data-testid="page">SSR Content</div> (route component)
    // </div>
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="page">SSR Content</div></div>';

    const routerViewContainer = root.firstChild as HTMLElement;
    const ssrPageNode = routerViewContainer.firstChild as HTMLElement;
    expect(routerViewContainer.children.length).toBe(1);

    startHydration(root);

    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              // Use __element like a real compiled component — claims SSR node during hydration
              const el = __element('div');
              el.setAttribute('data-testid', 'page');
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

    endHydration();

    // Before promise resolves, SSR content should still be present
    expect(view!.children.length).toBe(1);

    // After promise resolves, the lazy component should claim the SSR node
    await new Promise((r) => setTimeout(r, 0));

    // Must have exactly 1 child — NOT 2
    expect(view!.children.length).toBe(1);
    // The SSR node should be preserved (same DOM reference, not recreated)
    expect(view!.firstChild).toBe(ssrPageNode);
    router.dispose();
  });

  test('CSR-only lazy route works without hydration context', async () => {
    // No SSR DOM, no hydration — pure client-side render with lazy route
    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              const el = document.createElement('div');
              el.textContent = 'Lazy CSR';
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

    // Container should be empty before Promise resolves
    expect(view!.children.length).toBe(0);

    await new Promise((r) => setTimeout(r, 0));

    expect(view!.children.length).toBe(1);
    expect(view!.textContent).toBe('Lazy CSR');
    router.dispose();
  });

  test('hydration re-entry falls back to CSR on SSR/client mismatch', async () => {
    // SSR rendered a <div>, but client component creates a <span>
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="ssr">SSR</div></div>';

    startHydration(root);

    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              // Client creates a <span> — won't match the SSR <div>
              const el = __element('span');
              el.textContent = 'CSR Mismatch';
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

    endHydration();

    await new Promise((r) => setTimeout(r, 0));

    // Should have 1 child (the fallback-appended <span>), not duplicates
    expect(view!.children.length).toBe(1);
    expect(view!.firstChild!.nodeName).toBe('SPAN');
    expect(view!.textContent).toBe('CSR Mismatch');
    router.dispose();
  });

  test('stale lazy resolution discarded during pending hydration re-entry', async () => {
    // Start on /slow (lazy), navigate to /fast (sync) before lazy resolves
    const root = document.createElement('div');
    root.innerHTML = '<div><div>Slow SSR</div></div>';

    startHydration(root);

    let resolveSlowRoute: (value: { default: () => Node }) => void;
    const routes = defineRoutes({
      '/slow': {
        component: () =>
          new Promise<{ default: () => Node }>((resolve) => {
            resolveSlowRoute = resolve;
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

    endHydration();

    // Navigate away before the lazy route resolves
    await router.navigate({ to: '/fast' });
    expect(view!.textContent).toBe('Fast Page');

    // Now resolve the stale lazy route — it should be discarded (gen guard)
    resolveSlowRoute!({
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'Stale Slow Page';
        return el;
      },
    });
    await new Promise((r) => setTimeout(r, 0));

    // Still showing Fast Page, not the stale resolution
    expect(view!.textContent).toBe('Fast Page');
    router.dispose();
  });

  test('nested lazy parent + lazy child both re-enter hydration', async () => {
    // SSR rendered: layout > outlet > child
    const root = document.createElement('div');
    root.innerHTML =
      '<div>' +
      '<div class="layout">' +
      '<div>' + // Outlet container
      '<div>Child SSR</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    const routerViewContainer = root.firstChild as HTMLElement;
    const layoutDiv = routerViewContainer.firstChild as HTMLElement;
    const outletContainer = layoutDiv.firstChild as HTMLElement;
    const ssrChildNode = outletContainer.firstChild as HTMLElement;

    startHydration(root);

    const routes = defineRoutes({
      '/app': {
        component: () =>
          Promise.resolve({
            default: () => {
              const layout = __element('div');
              __enterChildren(layout);
              const outlet = Outlet();
              __exitChildren();
              return layout;
            },
          }),
        children: {
          '/page': {
            component: () =>
              Promise.resolve({
                default: () => {
                  return __element('div');
                },
              }),
          },
        },
      },
    });
    const router = createRouter(routes, '/app/page');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    endHydration();

    // Wait for both lazy routes to resolve
    await new Promise((r) => setTimeout(r, 10));

    // The layout should have claimed the SSR node
    expect(view!.children.length).toBe(1);
    // The child should be present inside the outlet
    expect(view!.querySelector('div > div > div')).not.toBeNull();
    router.dispose();
  });

  test('navigation works after lazy route hydration re-entry', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="home">Home SSR</div></div>';

    startHydration(root);

    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              const el = __element('div');
              el.setAttribute('data-testid', 'home');
              return el;
            },
          }),
      },
      '/other': {
        component: () => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'other');
          el.textContent = 'Other Page';
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    endHydration();

    // Wait for lazy route to hydrate
    await new Promise((r) => setTimeout(r, 0));
    expect(view!.children.length).toBe(1);

    // Navigate to sync route
    router.navigate({ to: '/other' });
    expect(view!.children.length).toBe(1);
    expect(view!.querySelector('[data-testid="other"]')).not.toBeNull();
    expect(view!.textContent).toBe('Other Page');
    router.dispose();
  });

  test('errorFallback catches sync route error and renders fallback', () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          throw new Error('route exploded');
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error, retry }) => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'error-fallback');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    expect(view!.querySelector('[data-testid="error-fallback"]')).not.toBeNull();
    expect(view!.textContent).toContain('Error: route exploded');
    router.dispose();
  });

  test('errorFallback retry re-renders the route component', () => {
    let attempts = 0;
    let retryFn: (() => void) | undefined;
    const routes = defineRoutes({
      '/': {
        component: () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('not ready');
          }
          const el = document.createElement('div');
          el.textContent = 'Success';
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error, retry }) => {
          retryFn = retry;
          const el = document.createElement('div');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    expect(view!.textContent).toContain('Error: not ready');
    expect(retryFn).toBeDefined();
    retryFn!();
    expect(view!.textContent).toContain('Success');
    router.dispose();
  });

  test('per-route errorComponent overrides global errorFallback', () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          throw new Error('boom');
        },
        errorComponent: ({ error }) => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'route-error');
          el.textContent = `Route error: ${error.message}`;
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error }) => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'global-error');
          el.textContent = `Global error: ${error.message}`;
          return el;
        },
      });
    });
    expect(view!.querySelector('[data-testid="route-error"]')).not.toBeNull();
    expect(view!.querySelector('[data-testid="global-error"]')).toBeNull();
    expect(view!.textContent).toContain('Route error: boom');
    router.dispose();
  });

  test('no errorFallback: error propagates normally', () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          throw new Error('unhandled');
        },
      },
    });
    const router = createRouter(routes, '/');
    expect(() => {
      RouterContext.Provider(router, () => {
        RouterView({ router });
      });
    }).toThrow('unhandled');
    router.dispose();
  });

  test('errorFallback: route that renders successfully is not affected', () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          const el = document.createElement('div');
          el.textContent = 'OK';
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error }) => {
          const el = document.createElement('div');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    expect(view!.textContent).toBe('OK');
    router.dispose();
  });

  test('errorFallback: navigating away from errored route cleans up and renders new route', async () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          throw new Error('home broke');
        },
      },
      '/about': {
        component: () => {
          const el = document.createElement('div');
          el.textContent = 'About Page';
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error }) => {
          const el = document.createElement('div');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    expect(view!.textContent).toContain('Error: home broke');

    // Navigate to a working route
    await router.navigate({ to: '/about' });
    expect(view!.textContent).toBe('About Page');
    expect(view!.textContent).not.toContain('Error');
    router.dispose();
  });

  test('errorFallback catches lazy route error after resolution', async () => {
    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              throw new Error('lazy boom');
            },
          }),
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error }) => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'error-fallback');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    // Wait for lazy resolution
    await new Promise((r) => setTimeout(r, 10));
    expect(view!.querySelector('[data-testid="error-fallback"]')).not.toBeNull();
    expect(view!.textContent).toContain('Error: lazy boom');
    router.dispose();
  });

  test('errorFallback with nested routes: leaf error does not take down parent layout', () => {
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
              throw new Error('settings broke');
            },
          },
        },
      },
    });
    const router = createRouter(routes, '/dashboard/settings');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error }) => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'error-fallback');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    // Parent layout should still be rendered
    expect(view!.querySelector('.dashboard-layout')).not.toBeNull();
    expect(view!.textContent).toContain('Dashboard');
    // Error fallback should be in the Outlet area
    expect(view!.querySelector('[data-testid="error-fallback"]')).not.toBeNull();
    expect(view!.textContent).toContain('Error: settings broke');
    router.dispose();
  });

  test('sync route with mismatched tag during hydration appears in DOM (#1368)', () => {
    // SSR rendered a <div>, but the sync route creates a <span>
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="ssr">SSR</div></div>';

    startHydration(root);

    const routes = defineRoutes({
      '/': {
        component: () => {
          const el = __element('span');
          el.textContent = 'CSR Mismatch';
          return el;
        },
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({ router });
    });

    endHydration();

    // The <span> should be in the DOM despite the mismatch
    expect(view!.children.length).toBe(1);
    expect(view!.firstChild!.nodeName).toBe('SPAN');
    expect(view!.textContent).toBe('CSR Mismatch');
    router.dispose();
  });

  test('propagates ancestor context to async/lazy route components (#2163)', async () => {
    // Bug: when a route component is dynamically imported (code splitting),
    // useContext() for contexts provided ABOVE RouterView returns undefined.
    // The Provider._stack has already been popped by the time the Promise
    // resolves, and the .then() handler only restores RouterContext.
    const ThemeContext = createContext<string>();
    let capturedTheme: string | undefined;

    const routes = defineRoutes({
      '/': {
        component: () =>
          Promise.resolve({
            default: () => {
              capturedTheme = useContext(ThemeContext);
              const el = document.createElement('div');
              el.textContent = capturedTheme ?? 'no-theme';
              return el;
            },
          }),
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    ThemeContext.Provider('dark', () => {
      RouterContext.Provider(router, () => {
        view = RouterView({ router });
      });
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(capturedTheme).toBe('dark');
    expect(view!.textContent).toBe('dark');
    router.dispose();
  });

  test('propagates ancestor context to async nested route via Outlet (#2163)', async () => {
    // Same bug but through Outlet: a nested lazy child route should still
    // see contexts provided above RouterView.
    const AppContext = createContext<string>();
    let capturedValue: string | undefined;

    const routes = defineRoutes({
      '/': {
        component: () => {
          const layout = document.createElement('div');
          layout.setAttribute('data-testid', 'layout');
          layout.appendChild(Outlet());
          return layout;
        },
        children: {
          '/child': {
            component: () =>
              Promise.resolve({
                default: () => {
                  capturedValue = useContext(AppContext);
                  const el = document.createElement('div');
                  el.textContent = capturedValue ?? 'no-context';
                  return el;
                },
              }),
          },
        },
      },
    });
    const router = createRouter(routes, '/child');
    let view: HTMLElement;
    AppContext.Provider('app-value', () => {
      RouterContext.Provider(router, () => {
        view = RouterView({ router });
      });
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(capturedValue).toBe('app-value');
    router.dispose();
  });

  test('errorFallback catches rejected dynamic import (#2163)', async () => {
    // When the dynamic import itself rejects (network error, missing chunk),
    // the error should be caught and rendered via errorFallback.
    const routes = defineRoutes({
      '/': {
        component: () => Promise.reject(new Error('chunk load failed')),
      },
    });
    const router = createRouter(routes, '/');
    let view: HTMLElement;
    RouterContext.Provider(router, () => {
      view = RouterView({
        router,
        errorFallback: ({ error }) => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'error-fallback');
          el.textContent = `Error: ${error.message}`;
          return el;
        },
      });
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(view!.querySelector('[data-testid="error-fallback"]')).not.toBeNull();
    expect(view!.textContent).toContain('Error: chunk load failed');
    router.dispose();
  });
});
