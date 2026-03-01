import { beforeEach, describe, expect, test } from 'bun:test';
import { onMount } from '../../component/lifecycle';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';
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

  test('renders matched route content during SSR (domEffect runs once)', () => {
    // Install SSR context so isSSR() returns true
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook for testing
    (globalThis as any).__VERTZ_IS_SSR__ = () => true;
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
