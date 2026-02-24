import { describe, expect, test } from 'bun:test';
import { lifecycleEffect } from '../../runtime/signal';
import { untrack } from '../../runtime/tracking';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';
import { RouterContext, useParams, useRouter } from '../router-context';

describe('RouterContext + useRouter', () => {
  test('useRouter throws when called outside RouterContext.Provider', () => {
    expect(() => useRouter()).toThrow('useRouter() must be called within RouterContext.Provider');
  });

  test('useRouter returns the router inside RouterContext.Provider', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    let result: ReturnType<typeof useRouter> | undefined;
    RouterContext.Provider(router, () => {
      result = useRouter();
    });

    expect(result).toBe(router);
    router.dispose();
  });

  test('useParams throws when called outside RouterContext.Provider', () => {
    expect(() => useParams()).toThrow('useParams() must be called within RouterContext.Provider');
  });

  test('useParams returns correct params inside RouterContext.Provider', () => {
    const routes = defineRoutes({
      '/tasks/:id': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/tasks/42');

    let params: Record<string, string> | undefined;
    RouterContext.Provider(router, () => {
      params = useParams();
    });

    expect(params).toEqual({ id: '42' });
    router.dispose();
  });

  test('useRouter works inside lifecycleEffect callback via captured context scope', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    let capturedRouter: ReturnType<typeof useRouter> | undefined;
    RouterContext.Provider(router, () => {
      lifecycleEffect(() => {
        router.current.value;
        untrack(() => {
          capturedRouter = useRouter();
        });
      });
    });

    expect(capturedRouter).toBe(router);
    router.dispose();
  });
});
