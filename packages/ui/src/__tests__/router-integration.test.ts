import { beforeEach, describe, expect, test } from 'bun:test';
import { createContext } from '../component/context';
import { defineRoutes, matchRoute } from '../router/define-routes';
import { executeLoaders } from '../router/loader';
import { createRouter } from '../router/navigate';
import { createOutlet, type OutletContext } from '../router/outlet';

describe('Router Integration Tests', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  // IT-6-1: defineRoutes matches paths and extracts typed params
  test('defineRoutes matches paths and extracts typed params', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/users': {
        component: () => document.createElement('div'),
        children: {
          '/': { component: () => document.createElement('ul') },
          '/:id': {
            component: () => document.createElement('article'),
          },
        },
      },
      '/posts/:slug': { component: () => document.createElement('article') },
    });

    // Match root
    const rootMatch = matchRoute(routes, '/');
    expect(rootMatch).not.toBeNull();
    expect(rootMatch?.params).toEqual({});

    // Match with params
    const userMatch = matchRoute(routes, '/users/42');
    expect(userMatch).not.toBeNull();
    expect(userMatch?.params).toEqual({ id: '42' });

    // Match top-level param route
    const postMatch = matchRoute(routes, '/posts/hello-world');
    expect(postMatch).not.toBeNull();
    expect(postMatch?.params).toEqual({ slug: 'hello-world' });

    // No match
    const noMatch = matchRoute(routes, '/nonexistent/deep/path');
    expect(noMatch).toBeNull();
  });

  // IT-6-2: Nested layouts render children correctly
  test('nested layouts render children correctly via Outlet', () => {
    const OutletCtx = createContext<OutletContext>();
    const Outlet = createOutlet(OutletCtx);

    // Child component
    const childContent = document.createElement('span');
    childContent.textContent = 'User Detail';
    const childComponent = () => childContent;

    // Parent layout that uses Outlet
    const parentLayout = document.createElement('div');
    parentLayout.className = 'layout';

    let outletResult: Node | undefined;
    OutletCtx.Provider({ childComponent, depth: 0 }, () => {
      outletResult = Outlet();
    });

    // biome-ignore lint/style/noNonNullAssertion: value is guaranteed set inside Provider callback
    parentLayout.appendChild(outletResult!);

    // Parent layout contains the child
    expect(parentLayout.querySelector('span')).toBe(childContent);
    expect(parentLayout.textContent).toBe('User Detail');

    // Outlet renders the child component
    expect(outletResult).toBe(childContent);
  });

  // IT-6-3: Parent and child loaders execute in parallel
  test('parent and child loaders execute in parallel', async () => {
    const timeline: string[] = [];

    const routes = defineRoutes({
      '/users': {
        component: () => document.createElement('div'),
        loader: async () => {
          timeline.push('parent-start');
          await new Promise((r) => setTimeout(r, 20));
          timeline.push('parent-end');
          return { users: ['Alice', 'Bob'] };
        },
        children: {
          '/:id': {
            component: () => document.createElement('div'),
            loader: async ({ params }) => {
              timeline.push('child-start');
              await new Promise((r) => setTimeout(r, 20));
              timeline.push('child-end');
              return { user: { id: params.id } };
            },
          },
        },
      },
    });

    const match = matchRoute(routes, '/users/123');
    expect(match).not.toBeNull();
    expect(match?.matched).toHaveLength(2);

    // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
    const results = await executeLoaders(match!.matched, match!.params);

    // Both loaders started before either finished (parallel execution)
    expect(timeline[0]).toBe('parent-start');
    expect(timeline[1]).toBe('child-start');

    // Results are in order
    expect(results[0]).toEqual({ users: ['Alice', 'Bob'] });
    expect(results[1]).toEqual({ user: { id: '123' } });
  });

  // IT-6-4: searchParams schema validates and coerces query string values
  test('searchParams schema validates and coerces query string values', () => {
    const routes = defineRoutes({
      '/users': {
        component: () => document.createElement('div'),
        searchParams: {
          parse(data: unknown) {
            const raw = data as Record<string, string>;
            return {
              ok: true as const,
              data: {
                page: raw.page ? Number(raw.page) : 1,
                sort: raw.sort ?? 'name',
              },
            };
          },
        },
      },
    });

    // With search params
    const match1 = matchRoute(routes, '/users?page=3&sort=email');
    expect(match1).not.toBeNull();
    expect(match1?.search).toEqual({ page: 3, sort: 'email' });
    // page is a number, not a string
    expect(typeof match1?.search.page).toBe('number');

    // Without search params (schema provides defaults)
    const match2 = matchRoute(routes, '/users');
    expect(match2).not.toBeNull();
    expect(match2?.search).toEqual({ page: 1, sort: 'name' });
  });

  // IT-6-5: Code splitting lazily loads route components on navigation
  test('code splitting lazily loads route components on navigation', async () => {
    let componentLoaded = false;

    // Simulate a lazy component (like () => import('./UserDetail'))
    const lazyComponent = async () => {
      componentLoaded = true;
      return {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Lazy Component';
          return el;
        },
      };
    };

    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/lazy': { component: lazyComponent },
    });

    const router = createRouter(routes, '/');

    // Component not loaded yet
    expect(componentLoaded).toBe(false);

    // Navigate to lazy route
    await router.navigate('/lazy');

    // Route matched
    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.route.pattern).toBe('/lazy');

    // Now resolve the lazy component
    const mod = await router.current.value?.route.component();
    expect(componentLoaded).toBe(true);

    // The module has a default export that creates the component
    const component = (mod as { default: () => Node }).default;
    const node = component();
    expect(node.textContent).toBe('Lazy Component');
  });

  // IT-6-6: Route error component renders when loader throws
  test('route error component renders when loader throws', async () => {
    const errorComponent = (error: Error) => {
      const el = document.createElement('div');
      el.className = 'error';
      el.textContent = `Error: ${error.message}`;
      return el;
    };

    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/broken': {
        component: () => document.createElement('div'),
        errorComponent,
        loader: async () => {
          throw new TypeError('Data fetch failed');
        },
      },
    });

    const router = createRouter(routes, '/');

    await router.navigate('/broken');

    // Route matched
    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.route.pattern).toBe('/broken');

    // Loader error is captured
    expect(router.loaderError.value).toBeInstanceOf(TypeError);
    expect(router.loaderError.value?.message).toBe('Data fetch failed');

    // Error component can render using the error
    const errorFn = router.current.value?.route.errorComponent;
    expect(errorFn).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
    const errorNode = errorFn!(router.loaderError.value!);
    expect(errorNode.textContent).toBe('Error: Data fetch failed');
    expect((errorNode as HTMLElement).className).toBe('error');
  });
});
