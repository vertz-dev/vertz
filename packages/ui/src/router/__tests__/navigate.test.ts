import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { createTestSSRContext, disableTestSSR, enableTestSSR } from '../../ssr/test-ssr-helpers';
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

    await router.navigate({ to: '/about' });

    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('navigate interpolates route params into the final URL', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks/:id': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/tasks/:id', params: { id: '42' } });

    expect(window.location.pathname).toBe('/tasks/42');
    expect(router.current.value?.route.pattern).toBe('/tasks/:id');
    expect(router.current.value?.params).toEqual({ id: '42' });
  });

  test('navigate rejects missing params at runtime', async () => {
    const routes = defineRoutes({
      '/tasks/:id': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/tasks/1');

    await expect((router as any).navigate({ to: '/tasks/:id' })).rejects.toThrow(
      'Missing route param "id" for path "/tasks/:id"',
    );
  });

  test('navigate runs loader and stores data', async () => {
    const loader = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/data': { component: () => document.createElement('div'), loader },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/data' });

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

    await router.navigate({ to: '/fail' });

    expect(router.loaderError.value).toBeInstanceOf(TypeError);
    expect(router.loaderError.value?.message).toBe('Network error');
  });

  test('navigate to unknown path sets current to null', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/nonexistent' });

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
    await router.navigate({ to: '/data' });
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

    await router.navigate({ to: '/about' });

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

    await router.navigate({ to: '/about', replace: true });

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
    await router.navigate({ to: '/about' });
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
    await router.navigate({ to: '/data' });
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

    await router.navigate({ to: '/about' });

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
    const nav1 = router.navigate({ to: '/slow' });
    // Immediately navigate to /fast
    const nav2 = router.navigate({ to: '/fast' });

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
    const nav1 = router.navigate({ to: '/a' });
    // Immediately navigate away
    await router.navigate({ to: '/b' });
    await nav1;

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
  });
});

// ─── Overloaded Signature ──────────────────────────────────

describe('createRouter overloaded signature', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('accepts options as second argument (auto-detects URL)', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });
    expect(router.current.value).not.toBeNull();
    router.dispose();
  });

  test('auto-detects URL from window.location when no initialUrl provided', () => {
    window.history.replaceState(null, '', '/about');
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);
    expect(router.current.value?.route.pattern).toBe('/about');
    router.dispose();
  });

  test('auto-detects URL including search params from window.location', () => {
    window.history.replaceState(null, '', '/tasks?status=done');
    const routes = defineRoutes({
      '/tasks': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);
    expect(router.current.value?.route.pattern).toBe('/tasks');
    router.dispose();
  });

  test('explicit initialUrl string still works (backward compat)', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/tasks');
    expect(router.current.value?.route.pattern).toBe('/tasks');
    router.dispose();
  });

  test('explicit initialUrl with options as third arg still works', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/tasks', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });
    expect(router.current.value?.route.pattern).toBe('/tasks');
    router.dispose();
  });

  test('options as second arg are applied (serverNav fires prefetch)', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate({ to: '/about' });

    expect(mockPrefetch).toHaveBeenCalledWith('/about', {});
    router.dispose();
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

    await router.navigate({ to: '/about' });

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

    await router.navigate({ to: '/about' });

    expect(mockPrefetch).not.toHaveBeenCalled();
    router.dispose();
  });

  test('search-param-only navigation skips prefetch', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Same route + replace = search-param-only change → skip prefetch
    await router.navigate({ to: '/?page=2', replace: true });

    expect(mockPrefetch).not.toHaveBeenCalled();
    router.dispose();
  });

  test('search-param-only navigation skips loaders', async () => {
    const loader = vi.fn().mockResolvedValue({ items: [] });
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div'), loader },
    });
    const router = createRouter(routes, '/');

    // Wait for initial load
    await new Promise((r) => setTimeout(r, 10));
    loader.mockClear();

    // Same route + replace = search-param-only change → skip loader
    await router.navigate({ to: '/?page=2', replace: true });

    expect(loader).not.toHaveBeenCalled();
    router.dispose();
  });

  test('different-route navigation still runs prefetch and loader', async () => {
    const loader = vi.fn().mockResolvedValue({ items: [] });
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div'), loader },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    await router.navigate({ to: '/about', replace: true });

    // Different route — prefetch and loader should run even with replace
    expect(mockPrefetch).toHaveBeenCalledWith('/about', {});
    expect(loader).toHaveBeenCalled();
    router.dispose();
  });

  test('same-route navigation without replace still runs prefetch', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const mockPrefetch = vi.fn(() => ({ abort: () => {} }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Same route but NOT replace → not a search-param-only change
    await router.navigate({ to: '/?page=2' });

    expect(mockPrefetch).toHaveBeenCalled();
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

    await router.navigate({ to: '/a' });
    await router.navigate({ to: '/b' });

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

    await router.navigate({ to: '/about' });
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

    await router.navigate({ to: '/about' });

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
    const navPromise = router.navigate({ to: '/about' }).then(() => {
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
    await router.navigate({ to: '/about' });

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
    const navPromise = router.navigate({ to: '/about' }).then(() => {
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
    const nav1 = router.navigate({ to: '/a' });
    // Start nav2 (instant) — should supersede nav1
    const nav2 = router.navigate({ to: '/b' });

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

    const nav1 = router.navigate({ to: '/a' });
    const nav2 = router.navigate({ to: '/b' });
    const nav3 = router.navigate({ to: '/c' });

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
    const nav1 = router.navigate({ to: '/tasks' }).then(() => {
      firstNavDone = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(firstNavDone).toBe(false); // Waiting for prefetch
    resolveFirstEvent();
    await nav1;
    expect(firstNavDone).toBe(true);
    expect(router.current.value?.route.pattern).toBe('/tasks');

    // Navigate away
    await router.navigate({ to: '/' });

    // Revisit /tasks — should NOT wait for prefetch (visited before)
    const start = Date.now();
    await router.navigate({ to: '/tasks' });
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
    const navPromise = router.navigate({ to: '/about' }).then(() => {
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
    await router.navigate({ to: '/tasks', search: 'a=1&b=2' });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
    router.dispose();
  });

  test('re-clicking same link does not restart prefetch timer', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks/2': { component: () => document.createElement('div') },
    });

    let resolveFirstEvent!: () => void;
    const firstEvent = new Promise<void>((r) => {
      resolveFirstEvent = r;
    });
    const abortFn = vi.fn();
    const mockPrefetch = vi.fn(() => {
      return {
        abort: abortFn,
        done: new Promise<void>(() => {}),
        firstEvent,
      };
    });
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Click 1: navigate to /tasks/2 (first visit, will wait for prefetch)
    const nav1 = router.navigate({ to: '/tasks/2' });

    // Give a tick — should be waiting for prefetch
    await new Promise((r) => setTimeout(r, 5));
    expect(router.current.value?.route.pattern).toBe('/');

    // Click 2: same URL — should NOT restart the prefetch
    const nav2 = router.navigate({ to: '/tasks/2' });

    // Prefetch should NOT have been aborted and re-created
    // (only 1 prefetch call, not 2)
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(abortFn).not.toHaveBeenCalled();

    // Resolve the original firstEvent
    resolveFirstEvent();
    await nav1;
    await nav2;

    // Page should show /tasks/2
    expect(router.current.value?.route.pattern).toBe('/tasks/2');
    router.dispose();
  });

  test('navigate A → navigate A again → page renders without double wait', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/detail': { component: () => document.createElement('div') },
    });

    // Simulate a slow prefetch that takes 300ms to send first event
    let resolveFirstEvent!: () => void;
    const firstEvent = new Promise<void>((r) => {
      resolveFirstEvent = r;
    });
    // After 300ms, resolve firstEvent
    setTimeout(() => resolveFirstEvent(), 300);

    const mockPrefetch = vi.fn(() => ({
      abort: () => {},
      done: new Promise<void>(() => {}),
      firstEvent,
    }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Click 1 at t=0
    router.navigate({ to: '/detail' });

    // Click 2 at t=100ms (user re-clicks, thinking nothing happened)
    await new Promise((r) => setTimeout(r, 100));
    const start = Date.now();
    await router.navigate({ to: '/detail' });
    const elapsed = Date.now() - start;

    // Should complete within ~200ms (remaining time on original firstEvent),
    // NOT restart a new 300ms timer
    expect(elapsed).toBeLessThan(400);
    expect(router.current.value?.route.pattern).toBe('/detail');
    router.dispose();
  });

  test('list → detail → list → detail2: all navigations complete correctly', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks/1': { component: () => document.createElement('div') },
      '/tasks/2': { component: () => document.createElement('div') },
    });

    const mockPrefetch = vi.fn(() => ({
      abort: () => {},
      done: Promise.resolve(),
      firstEvent: Promise.resolve(),
    }));
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockPrefetch,
    });

    // Step 1: list → detail 1
    await router.navigate({ to: '/tasks/1' });
    expect(router.current.value?.route.pattern).toBe('/tasks/1');

    // Step 2: detail 1 → list (cached — visited before)
    await router.navigate({ to: '/' });
    expect(router.current.value?.route.pattern).toBe('/');

    // Step 3: list → detail 2 (first visit)
    await router.navigate({ to: '/tasks/2' });
    expect(router.current.value?.route.pattern).toBe('/tasks/2');

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
    await router.navigate({ to: '/about' });
    mockPrefetch.mockClear();

    // Simulate popstate (back button)
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await new Promise((r) => setTimeout(r, 10));

    expect(mockPrefetch).toHaveBeenCalledWith('/', {});
    router.dispose();
  });
});

// ─── SSR-Aware Getters ──────────────────────────────────

describe('createRouter SSR', () => {
  afterEach(() => {
    disableTestSSR();
  });

  test('returns lightweight router in SSR context', () => {
    const _ctx = enableTestSSR(createTestSSRContext('/about'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('accepts options as second argument in SSR context', () => {
    const _ctx = enableTestSSR(createTestSSRContext('/about'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, { serverNav: true });

    expect(router.current.value).not.toBeNull();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('SSR router current.value uses per-request URL from context', () => {
    const ctx = createTestSSRContext('/tasks');
    enableTestSSR(ctx);
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/tasks': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.current.value?.route.pattern).toBe('/tasks');

    // Change context URL — getter should reflect new URL
    ctx.url = '/';
    expect(router.current.value?.route.pattern).toBe('/');
  });

  test('SSR router current.peek() returns per-request match', () => {
    enableTestSSR(createTestSSRContext('/about'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.current.peek()?.route.pattern).toBe('/about');
  });

  test('SSR router searchParams.value returns raw params for routes without schema', () => {
    enableTestSSR(createTestSSRContext('/tasks?status=done'));
    const routes = defineRoutes({
      '/tasks': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    // Without a searchParams schema, raw string params are returned
    expect(router.searchParams.value).toEqual({ status: 'done' });
  });

  test('SSR router searchParams.peek() returns raw params for routes without schema', () => {
    enableTestSSR(createTestSSRContext('/tasks?q=hello'));
    const routes = defineRoutes({
      '/tasks': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.searchParams.peek()).toEqual({ q: 'hello' });
  });

  test('SSR router navigate/revalidate/dispose are no-ops', async () => {
    enableTestSSR(createTestSSRContext('/'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    // Should not throw
    await router.navigate({ to: '/' });
    await router.revalidate();
    router.dispose();
  });

  test('SSR router loaderData and loaderError are static', () => {
    enableTestSSR(createTestSSRContext('/'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.loaderData.value).toEqual([]);
    expect(router.loaderData.peek()).toEqual([]);
    expect(router.loaderError.value).toBeNull();
    expect(router.loaderError.peek()).toBeNull();
  });

  test('SSR router falls back to initialUrl when no SSR context URL', () => {
    // Enable SSR but the getter returns per-request URL from context
    enableTestSSR(createTestSSRContext('/settings'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/settings': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.current.value?.route.pattern).toBe('/settings');
  });

  test('SSR router current.value returns null for unmatched URL', () => {
    enableTestSSR(createTestSSRContext('/nonexistent'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.current.value).toBeNull();
  });

  test('SSR router searchParams returns empty object for unmatched URL', () => {
    enableTestSSR(createTestSSRContext('/nonexistent'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    expect(router.searchParams.value).toEqual({});
    expect(router.searchParams.peek()).toEqual({});
  });

  test('SSR router current.notify is a no-op', () => {
    enableTestSSR(createTestSSRContext('/'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    // Should not throw
    router.current.notify();
    router.searchParams.notify();
  });

  test('SSR router writes discoveredRoutes lazily on first getter access', () => {
    const ctx = enableTestSSR(createTestSSRContext('/'));
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
      '/users/:id': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    // Not set at createRouter() time — deferred to getter access
    expect(ctx.discoveredRoutes).toBeUndefined();

    // Trigger lazy discovery
    router.current.value;

    expect(ctx.discoveredRoutes).toBeDefined();
    expect(ctx.discoveredRoutes).toContain('/');
    expect(ctx.discoveredRoutes).toContain('/about');
    expect(ctx.discoveredRoutes).toContain('/users/:id');
  });

  test('SSR router discovers nested children as full paths', () => {
    const ctx = enableTestSSR(createTestSSRContext('/'));
    const routes = defineRoutes({
      '/docs': {
        component: () => document.createElement('div'),
        children: {
          '/': { component: () => document.createElement('div') },
          '/:slug': { component: () => document.createElement('div') },
        },
      },
    });
    const router = createRouter(routes);

    // Trigger lazy discovery
    router.current.value;

    expect(ctx.discoveredRoutes).toContain('/docs');
    expect(ctx.discoveredRoutes).toContain('/docs/:slug');
  });

  test('SSR router does not write discoveredRoutes without SSR context', () => {
    disableTestSSR();
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    // In browser environment (no SSR context), no discoveredRoutes
    const router = createRouter(routes, '/');
    // Just verify it doesn't crash — no context to inspect
    expect(router.current.value).not.toBeNull();
  });

  test('SSR router matchedRoutePatterns uses full paths for nested routes', () => {
    const ctx = enableTestSSR(createTestSSRContext('/dashboard/settings'));
    const routes = defineRoutes({
      '/dashboard': {
        component: () => document.createElement('div'),
        children: {
          '/settings': { component: () => document.createElement('div') },
          '/profile': { component: () => document.createElement('div') },
        },
      },
    });
    const router = createRouter(routes);

    // Trigger match
    router.current.value;

    expect(ctx.matchedRoutePatterns).toEqual(['/dashboard', '/dashboard/settings']);
  });

  test('SSR router matchedRoutePatterns uses full paths for deeply nested routes', () => {
    const ctx = enableTestSSR(createTestSSRContext('/app/teams/t1/members'));
    const routes = defineRoutes({
      '/app': {
        component: () => document.createElement('div'),
        children: {
          '/teams/:teamId': {
            component: () => document.createElement('div'),
            children: {
              '/members': { component: () => document.createElement('div') },
            },
          },
        },
      },
    });
    const router = createRouter(routes);

    router.current.value;

    expect(ctx.matchedRoutePatterns).toEqual([
      '/app',
      '/app/teams/:teamId',
      '/app/teams/:teamId/members',
    ]);
  });
});

describe('createRouter viewTransition', () => {
  let mockStartVT: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    mockStartVT = vi.fn((cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      };
    });
    (document as Record<string, unknown>).startViewTransition = mockStartVT;
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  });

  afterEach(() => {
    delete (document as Record<string, unknown>).startViewTransition;
    vi.restoreAllMocks();
  });

  test('navigate() calls startViewTransition when global viewTransition is true', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/', { viewTransition: true });

    await router.navigate({ to: '/about' });

    expect(mockStartVT).toHaveBeenCalledTimes(1);
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('navigate() does not call startViewTransition when no viewTransition config', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/about' });

    expect(mockStartVT).not.toHaveBeenCalled();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('navigate() uses route-level viewTransition config', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': {
        component: () => document.createElement('div'),
        viewTransition: { className: 'slide' },
      },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/about' });

    expect(mockStartVT).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('slide')).toBe(false); // cleaned up after
  });

  test('route viewTransition: false overrides global viewTransition: true', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/no-transition': {
        component: () => document.createElement('div'),
        viewTransition: false,
      },
    });
    const router = createRouter(routes, '/', { viewTransition: true });

    await router.navigate({ to: '/no-transition' });

    expect(mockStartVT).not.toHaveBeenCalled();
    expect(router.current.value?.route.pattern).toBe('/no-transition');
  });

  test('per-navigation viewTransition: false overrides global and route config', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': {
        component: () => document.createElement('div'),
        viewTransition: true,
      },
    });
    const router = createRouter(routes, '/', { viewTransition: true });

    await router.navigate({ to: '/about', viewTransition: false });

    expect(mockStartVT).not.toHaveBeenCalled();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  test('per-navigation viewTransition: true overrides route false', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/no-transition': {
        component: () => document.createElement('div'),
        viewTransition: false,
      },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/no-transition', viewTransition: true });

    expect(mockStartVT).toHaveBeenCalledTimes(1);
  });

  test('search-param-only navigation skips view transitions', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/', { viewTransition: true });

    // Navigate with same route + replace (search-param-only pattern)
    await router.navigate({ to: '/?page=2', replace: true });

    // View transition should NOT have been called
    expect(mockStartVT).not.toHaveBeenCalled();

    router.dispose();
  });

  test('popstate wraps navigation in view transition when globally enabled', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/', { viewTransition: true });

    // Navigate to /about first
    await router.navigate({ to: '/about' });
    mockStartVT.mockClear();

    // Simulate back button
    window.history.back();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockStartVT).toHaveBeenCalled();
  });

  test('popstate uses target route viewTransition config', async () => {
    const routes = defineRoutes({
      '/': {
        component: () => document.createElement('div'),
        viewTransition: { className: 'slide' },
      },
      '/about': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    // Navigate away from / (which has viewTransition config)
    await router.navigate({ to: '/about' });
    mockStartVT.mockClear();

    // Go back to / — should use /'s viewTransition config
    window.history.back();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockStartVT).toHaveBeenCalled();
  });
});
