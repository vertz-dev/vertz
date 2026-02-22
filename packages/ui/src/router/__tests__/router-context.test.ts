import { describe, expect, test } from 'vitest';
import { watch } from '../../component/lifecycle';
import { createRouter } from '../navigate';
import { defineRoutes } from '../define-routes';
import { RouterContext, useRouter } from '../router-context';

describe('RouterContext + useRouter', () => {
  test('useRouter throws when called outside RouterContext.Provider', () => {
    expect(() => useRouter()).toThrow(
      'useRouter() must be called within RouterContext.Provider',
    );
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

  test('useRouter works inside watch callback via captured context scope', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');

    let capturedRouter: ReturnType<typeof useRouter> | undefined;
    RouterContext.Provider(router, () => {
      watch(
        () => router.current.value,
        () => {
          capturedRouter = useRouter();
        },
      );
    });

    expect(capturedRouter).toBe(router);
    router.dispose();
  });
});
