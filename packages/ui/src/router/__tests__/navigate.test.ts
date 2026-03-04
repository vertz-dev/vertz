import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { defineRoutes } from '../define-routes';
import type { RouterOptions } from '../navigate';
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

// ─── Server Nav Integration ──────────────────────────────────

describe('createRouter serverNav', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('accepts RouterOptions as third parameter', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const options: RouterOptions = {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    };
    const router = createRouter(routes, '/', options);
    expect(router.current.value).not.toBeNull();
    router.dispose();
  });

  test('navigate calls prefetchNavData when serverNav enabled', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate('/about');

    expect(mockPrefetch).toHaveBeenCalledWith('/about', {});
    router.dispose();
  });

  test('navigate skips prefetch when serverNav disabled', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: false,
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate('/about');

    expect(mockPrefetch).not.toHaveBeenCalled();
    router.dispose();
  });

  test('rapid navigation aborts previous prefetch', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/a': { component: () => document.createElement('div') },
      '/b': { component: () => document.createElement('div') },
    });
    const abortFn = vi.fn();
    const mockPrefetch = vi.fn(() => ({ abort: abortFn }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate('/a');
    await router.navigate('/b');

    // First prefetch should have been aborted when second nav started
    expect(abortFn).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledTimes(2);
    router.dispose();
  });

  test('dispose aborts active prefetch', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const abortFn = vi.fn();
    const mockPrefetch = vi.fn(() => ({ abort: abortFn }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate('/about');
    router.dispose();

    expect(abortFn).toHaveBeenCalled();
  });

  test('serverNav timeout is forwarded to prefetchNavData', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: { timeout: 3000 },
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate('/about');

    expect(mockPrefetch).toHaveBeenCalledWith('/about', { timeout: 3000 });
    router.dispose();
  });

  test('navigate waits for prefetch done before applying navigation', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });

    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {}, done }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Start navigation — should wait for prefetch done
    let navigated = false;
    const navPromise = router.navigate('/about').then(() => {
      navigated = true;
    });

    // Give a tick — navigate should NOT have resolved yet (prefetch pending)
    await new Promise((r) => setTimeout(r, 5));
    expect(navigated).toBe(false);
    // Route should NOT be updated yet
    expect(router.current.value?.route.pattern).toBe('/');

    // Now resolve the prefetch
    resolveDone();
    await navPromise;

    // NOW the route should be updated
    expect(navigated).toBe(true);
    expect(router.current.value?.route.pattern).toBe('/about');
    router.dispose();
  });

  test('navigate proceeds after threshold even if prefetch not done', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });

    // Prefetch that never resolves
    const mockPrefetch = vi.fn(() => ({
      abort: () => {},
      done: new Promise<void>(() => {}),
    }));
    const router = createRouter(routes, '/', {
      serverNav: { timeout: 5000 },
      _prefetchNavData: mockPrefetch,
    });

    // Navigate — should proceed after threshold (~500ms) even though prefetch never completes
    await router.navigate('/about');

    expect(router.current.value?.route.pattern).toBe('/about');
    router.dispose();
  });

  test('navigate resolves when firstEvent resolves (before done)', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });

    let resolveFirstEvent!: () => void;
    const firstEvent = new Promise<void>((r) => {
      resolveFirstEvent = r;
    });
    const mockPrefetch = vi.fn(() => ({
      abort: () => {},
      done: new Promise<void>(() => {}), // never resolves
      firstEvent,
    }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    let navigated = false;
    const navPromise = router.navigate('/about').then(() => {
      navigated = true;
    });

    // Not navigated yet — firstEvent pending
    await new Promise((r) => setTimeout(r, 5));
    expect(navigated).toBe(false);

    // Resolve firstEvent — navigation should proceed
    resolveFirstEvent();
    await navPromise;

    expect(navigated).toBe(true);
    expect(router.current.value?.route.pattern).toBe('/about');
    router.dispose();
  });

  test('rapid nav1 → nav2: nav1 applyNavigation is skipped after awaitPrefetch', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/a': { component: () => document.createElement('div') },
      '/b': { component: () => document.createElement('div') },
    });

    let resolveDone1!: () => void;
    const done1 = new Promise<void>((r) => {
      resolveDone1 = r;
    });
    let callCount = 0;
    const mockPrefetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First nav: slow prefetch
        return { abort: () => {}, done: done1, firstEvent: done1 };
      }
      // Second nav: instant
      return { abort: () => {}, done: Promise.resolve(), firstEvent: Promise.resolve() };
    });
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Start nav1 (slow) — will wait on awaitPrefetch
    const nav1 = router.navigate('/a');
    // Start nav2 (instant) — should supersede nav1
    const nav2 = router.navigate('/b');

    // Resolve nav1's prefetch after nav2 started
    resolveDone1();
    await nav1;
    await nav2;

    // Only nav2's route should be active
    expect(router.current.value?.route.pattern).toBe('/b');
    router.dispose();
  });

  test('rapid nav1 → nav2 → nav3: only nav3 applyNavigation runs', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/a': { component: () => document.createElement('div') },
      '/b': { component: () => document.createElement('div') },
      '/c': { component: () => document.createElement('div') },
    });

    let resolveDone1!: () => void;
    const done1 = new Promise<void>((r) => {
      resolveDone1 = r;
    });
    let resolveDone2!: () => void;
    const done2 = new Promise<void>((r) => {
      resolveDone2 = r;
    });
    let callCount = 0;
    const mockPrefetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return { abort: () => {}, done: done1, firstEvent: done1 };
      }
      if (callCount === 2) {
        return { abort: () => {}, done: done2, firstEvent: done2 };
      }
      return { abort: () => {}, done: Promise.resolve(), firstEvent: Promise.resolve() };
    });
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    const nav1 = router.navigate('/a');
    const nav2 = router.navigate('/b');
    const nav3 = router.navigate('/c');

    resolveDone1();
    resolveDone2();
    await nav1;
    await nav2;
    await nav3;

    // Only nav3's route should be active
    expect(router.current.value?.route.pattern).toBe('/c');
    router.dispose();
  });

  test('skips SSE wait for previously visited URLs', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks': { component: () => document.createElement('div') },
    });

    let resolveFirstEvent!: () => void;
    const firstEvent = new Promise<void>((r) => {
      resolveFirstEvent = r;
    });
    let callCount = 0;
    const mockPrefetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First nav to /tasks: slow prefetch
        return { abort: () => {}, done: new Promise<void>(() => {}), firstEvent };
      }
      // Second nav to /tasks: should skip wait entirely, but still fire prefetch
      return {
        abort: () => {},
        done: new Promise<void>(() => {}),
        firstEvent: new Promise<void>(() => {}),
      };
    });
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // First visit to /tasks — should wait for firstEvent
    let firstNavDone = false;
    const nav1 = router.navigate('/tasks').then(() => {
      firstNavDone = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(firstNavDone).toBe(false); // Waiting for prefetch
    resolveFirstEvent();
    await nav1;
    expect(firstNavDone).toBe(true);
    expect(router.current.value?.route.pattern).toBe('/tasks');

    // Navigate away
    await router.navigate('/');

    // Revisit /tasks — should NOT wait for prefetch (visited before)
    const start = Date.now();
    await router.navigate('/tasks');
    const elapsed = Date.now() - start;

    expect(router.current.value?.route.pattern).toBe('/tasks');
    // Should have been near-instant (no 500ms wait)
    expect(elapsed).toBeLessThan(50);
    // Prefetch was still called (for SWR revalidation)
    expect(mockPrefetch).toHaveBeenCalledTimes(3);

    router.dispose();
  });

  test('waits for SSE data on first-visit URLs', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });

    let resolveFirstEvent!: () => void;
    const firstEvent = new Promise<void>((r) => {
      resolveFirstEvent = r;
    });
    const mockPrefetch = vi.fn(() => ({
      abort: () => {},
      done: new Promise<void>(() => {}),
      firstEvent,
    }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // First visit to /about — should wait for firstEvent
    let navigated = false;
    const navPromise = router.navigate('/about').then(() => {
      navigated = true;
    });

    await new Promise((r) => setTimeout(r, 5));
    expect(navigated).toBe(false);

    resolveFirstEvent();
    await navPromise;
    expect(navigated).toBe(true);
    expect(router.current.value?.route.pattern).toBe('/about');

    router.dispose();
  });

  test('normalizes URL query params for visited URL matching', async () => {
    const routes = defineRoutes({
      '/tasks': { component: () => document.createElement('div') },
    });

    const mockPrefetch = vi.fn(() => ({
      abort: () => {},
      done: Promise.resolve(),
      firstEvent: Promise.resolve(),
    }));
    const router = createRouter(routes, '/tasks?b=2&a=1', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Navigate to same URL with different param order — should skip wait
    const start = Date.now();
    await router.navigate('/tasks?a=1&b=2');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
    router.dispose();
  });

  test('popstate triggers prefetch', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Navigate to /about first
    await router.navigate('/about');
    mockPrefetch.mockClear();

    // Simulate popstate (back button)
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await new Promise((r) => setTimeout(r, 10));

    expect(mockPrefetch).toHaveBeenCalledWith('/', {});
    router.dispose();
  });
});
