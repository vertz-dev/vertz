import { describe, expect, test } from '@vertz/test';
import { lifecycleEffect } from '../../runtime/signal';
import { untrack } from '../../runtime/tracking';
import type { ParamSchema } from '../define-routes';
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

    // wrapSignalProps creates a new object with getters, so reference
    // identity differs. Verify behaviour: functions are the same refs,
    // signal props are auto-unwrapped to their current values.
    expect(result).toBeDefined();
    expect(result!.navigate).toBe(router.navigate);
    expect(result!.dispose).toBe(router.dispose);
    expect(result!.current).toEqual(router.current.value);
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

  test('useParams returns parsedParams when route has a params schema', () => {
    const numSchema: ParamSchema<{ id: number }> = {
      parse(raw) {
        const { id } = raw as { id: string };
        const num = Number(id);
        if (Number.isNaN(num)) return { ok: false, error: 'not a number' };
        return { ok: true, data: { id: num } };
      },
    };
    const routes = defineRoutes({
      '/items/:id': {
        component: () => document.createElement('div'),
        params: numSchema,
      },
    });
    const router = createRouter(routes, '/items/42');

    let params: unknown;
    RouterContext.Provider(router, () => {
      params = useParams();
    });

    // parsedParams is preferred — schema transforms string '42' to number 42
    expect(params).toEqual({ id: 42 });
    router.dispose();
  });

  test('useParams returns raw params when no schema is present', () => {
    const routes = defineRoutes({
      '/items/:id': {
        component: () => document.createElement('div'),
      },
    });
    const router = createRouter(routes, '/items/42');

    let params: unknown;
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

    // wrapSignalProps creates a new object, so check behaviour not identity
    expect(capturedRouter).toBeDefined();
    expect(capturedRouter!.navigate).toBe(router.navigate);
    expect(capturedRouter!.dispose).toBe(router.dispose);
    expect(capturedRouter!.current).toEqual(router.current.value);
    router.dispose();
  });
});
