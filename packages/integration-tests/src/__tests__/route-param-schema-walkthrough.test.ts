/**
 * Developer Walkthrough — Route Param Schemas
 *
 * Integration test using public package imports (@vertz/ui) to validate
 * route param schema parsing at the routing layer.
 *
 * @see plans/route-param-schemas.md
 */

import { describe, expect, it } from 'bun:test';
import type { ParamSchema } from '@vertz/ui';
import { createRouter, defineRoutes } from '@vertz/ui';

describe('Route param schema walkthrough', () => {
  const uuidSchema: ParamSchema<{ id: string }> = {
    parse(raw) {
      const { id } = raw as { id: string };
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) return { ok: false, error: `Invalid UUID: ${id}` };
      return { ok: true, data: { id } };
    },
  };

  const routes = defineRoutes({
    '/': { component: () => document.createElement('div') },
    '/tasks/:id': {
      component: () => document.createElement('div'),
      params: uuidSchema,
    },
    '/items/:id': {
      component: () => document.createElement('div'),
      // No params schema — backward compat
    },
  });

  it('routes with valid params when schema accepts', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const router = createRouter(routes, `/tasks/${validUuid}`);
    expect(router.current.value).not.toBeNull();
    expect(router.current.value!.params).toEqual({ id: validUuid });
    expect(router.current.value!.parsedParams).toEqual({ id: validUuid });
    router.dispose();
  });

  it('rejects route when schema rejects params (returns null match)', () => {
    const router = createRouter(routes, '/tasks/not-a-uuid');
    expect(router.current.value).toBeNull();
    router.dispose();
  });

  it('routes without schema work unchanged (backward compat)', () => {
    const router = createRouter(routes, '/items/42');
    expect(router.current.value).not.toBeNull();
    expect(router.current.value!.params).toEqual({ id: '42' });
    expect(router.current.value!.parsedParams).toBeUndefined();
    router.dispose();
  });

  it('schema can transform param values', () => {
    const numSchema: ParamSchema<{ id: number }> = {
      parse(raw) {
        const { id } = raw as { id: string };
        const num = Number(id);
        if (Number.isNaN(num)) return { ok: false, error: 'not a number' };
        return { ok: true, data: { id: num } };
      },
    };

    const numRoutes = defineRoutes({
      '/items/:id': {
        component: () => document.createElement('div'),
        params: numSchema,
      },
    });

    const router = createRouter(numRoutes, '/items/42');
    expect(router.current.value).not.toBeNull();
    expect(router.current.value!.params).toEqual({ id: '42' });
    expect(router.current.value!.parsedParams).toEqual({ id: 42 });
    router.dispose();
  });

  it('schema that throws is treated as rejection', () => {
    const throwingSchema: ParamSchema<{ id: string }> = {
      parse() {
        throw new Error('boom');
      },
    };

    const throwRoutes = defineRoutes({
      '/items/:id': {
        component: () => document.createElement('div'),
        params: throwingSchema,
      },
    });

    const router = createRouter(throwRoutes, '/items/42');
    expect(router.current.value).toBeNull();
    router.dispose();
  });
});
