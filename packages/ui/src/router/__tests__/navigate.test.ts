import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';

describe('createRouter', () => {
  beforeEach(() => {
    // Reset history state
    window.history.replaceState(null, '', '/');
  });

  test('creates a router with initial route match', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');
    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.params).toEqual({});
  });

  test('navigate updates current route', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    await router.navigate('/about');

    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('navigate runs loader and stores data', async () => {
    const loader = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/data': { component: () => document.createElement('div'), loader },
    });
    const router = createRouter(routes, '/');

    await router.navigate('/data');

    expect(loader).toHaveBeenCalled();
    expect(router.loaderData.value).toEqual([{ items: [1, 2, 3] }]);
  });

  test('navigate stores loader error when loader throws', async () => {
    const loader = vi.fn().mockRejectedValue(new TypeError('Network error'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/fail': { component: () => document.createElement('div'), loader },
    });
    const router = createRouter(routes, '/');

    await router.navigate('/fail');

    expect(router.loaderError.value).toBeInstanceOf(TypeError);
    expect(router.loaderError.value?.message).toBe('Network error');
  });

  test('navigate to unknown path sets current to null', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    await router.navigate('/nonexistent');

    expect(router.current.value).toBeNull();
  });

  test('revalidate re-runs current route loaders', async () => {
    let callCount = 0;
    const loader = vi.fn(async () => {
      callCount++;
      return { count: callCount };
    });
    const routes = defineRoutes({
      '/data': { component: () => document.createElement('div'), loader },
    });
    const router = createRouter(routes, '/data');

    // Wait for initial load
    await router.navigate('/data');
    expect(callCount).toBe(2); // initial + navigate
    const firstData = router.loaderData.value;

    await router.revalidate();
    expect(callCount).toBe(3);
    expect(router.loaderData.value).not.toBe(firstData);
  });

  test('navigate pushes to history', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    await router.navigate('/about');

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/about');
    pushSpy.mockRestore();
  });

  test('navigate with replace uses replaceState', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    await router.navigate('/about', { replace: true });

    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/about');
    replaceSpy.mockRestore();
  });

  test('popstate event updates router state (back/forward)', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    // Navigate to /about (pushes to history)
    await router.navigate('/about');
    expect(router.current.value?.route.pattern).toBe('/about');

    // Simulate browser back button: set location then fire popstate
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    // Allow async loaders to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(router.current.value?.route.pattern).toBe('/');
  });

  test('popstate runs loaders for the new route', async () => {
    const loader = vi.fn().mockResolvedValue({ data: 'fresh' });
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/data': { component: () => document.createElement('div'), loader },
    });
    const router = createRouter(routes, '/');

    // Navigate to /data
    await router.navigate('/data');
    loader.mockClear();

    // Simulate back to /, then forward to /data
    window.history.replaceState(null, '', '/data');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await new Promise((r) => setTimeout(r, 10));

    expect(loader).toHaveBeenCalled();
  });

  test('dispose removes the popstate listener', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    await router.navigate('/about');

    // Dispose the router
    router.dispose();

    // Simulate popstate — should NOT update state
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await new Promise((r) => setTimeout(r, 10));

    // Still on /about because listener was removed
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('stale loader results are discarded on rapid navigation', async () => {
    let resolveFirst!: (v: unknown) => void;
    const slowLoader = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const fastLoader = vi.fn().mockResolvedValue({ fast: true });

    const routes = defineRoutes({
      '/slow': { component: () => document.createElement('div'), loader: slowLoader },
      '/fast': { component: () => document.createElement('div'), loader: fastLoader },
    });
    const router = createRouter(routes, '/slow');

    // Wait for initial load to settle
    await new Promise((r) => setTimeout(r, 10));

    // Start navigation to /slow (will be slow)
    const nav1 = router.navigate('/slow');
    // Immediately navigate to /fast
    const nav2 = router.navigate('/fast');

    // Now resolve the first slow loader (stale!)
    resolveFirst({ stale: true });

    await nav1;
    await nav2;

    // The fast loader data should be current, not stale
    expect(router.current.value?.route.pattern).toBe('/fast');
    expect(router.loaderData.value).toEqual([{ fast: true }]);
  });

  test('loader receives AbortSignal that aborts on new navigation', async () => {
    let capturedSignal: AbortSignal | undefined;
    const loader = vi.fn(async (ctx: { params: Record<string, string>; signal: AbortSignal }) => {
      capturedSignal = ctx.signal;
      return { data: true };
    });

    const routes = defineRoutes({
      '/a': { component: () => document.createElement('div'), loader },
      '/b': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/a');

    // Wait for initial loader
    await new Promise((r) => setTimeout(r, 10));

    // Navigate to /a again to trigger loader
    const nav1 = router.navigate('/a');
    // Immediately navigate away
    await router.navigate('/b');
    await nav1;

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
