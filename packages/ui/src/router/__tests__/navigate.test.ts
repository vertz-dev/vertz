import { beforeEach, describe, expect, test, vi } from 'vitest';
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
});
