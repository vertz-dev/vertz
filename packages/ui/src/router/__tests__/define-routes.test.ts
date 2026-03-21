import { describe, expect, test } from 'bun:test';
import type { ParamSchema } from '../define-routes';
import { defineRoutes, matchRoute } from '../define-routes';

describe('defineRoutes', () => {
  test('creates a route configuration object', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    expect(routes).toBeDefined();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes).toHaveLength(2);
  });

  test('preserves route order', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/users': { component: () => document.createElement('div') },
      '/posts': { component: () => document.createElement('div') },
    });
    expect(routes[0]?.pattern).toBe('/');
    expect(routes[1]?.pattern).toBe('/users');
    expect(routes[2]?.pattern).toBe('/posts');
  });

  test('flattens nested children with full path', () => {
    const routes = defineRoutes({
      '/users': {
        component: () => document.createElement('div'),
        children: {
          '/': { component: () => document.createElement('div') },
          '/:id': { component: () => document.createElement('div') },
        },
      },
    });
    // Should have parent route + 2 child routes
    expect(routes).toHaveLength(1);
    expect(routes[0]?.children).toHaveLength(2);
    expect(routes[0]?.children?.[0]?.pattern).toBe('/');
    expect(routes[0]?.children?.[1]?.pattern).toBe('/:id');
  });
});

describe('matchRoute', () => {
  test('matches a simple static route', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const match = matchRoute(routes, '/about');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({});
  });

  test('matches route with params', () => {
    const routes = defineRoutes({
      '/users/:id': { component: () => document.createElement('div') },
    });
    const match = matchRoute(routes, '/users/123');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: '123' });
  });

  test('matches first route in definition order', () => {
    const compA = () => document.createElement('div');
    const compB = () => document.createElement('span');
    const routes = defineRoutes({
      '/users/:id': { component: compA },
      '/users/:name': { component: compB },
    });
    const match = matchRoute(routes, '/users/bob');
    expect(match).not.toBeNull();
    expect(match?.route.component).toBe(compA);
  });

  test('returns null when no route matches', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const match = matchRoute(routes, '/nonexistent');
    expect(match).toBeNull();
  });

  test('matches nested child route', () => {
    const routes = defineRoutes({
      '/users': {
        component: () => document.createElement('div'),
        children: {
          '/:id': { component: () => document.createElement('span') },
        },
      },
    });
    const match = matchRoute(routes, '/users/123');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: '123' });
    expect(match?.matched).toHaveLength(2); // parent + child
  });

  test('matches nested index route', () => {
    const routes = defineRoutes({
      '/users': {
        component: () => document.createElement('div'),
        children: {
          '/': { component: () => document.createElement('span') },
        },
      },
    });
    const match = matchRoute(routes, '/users');
    expect(match).not.toBeNull();
    expect(match?.matched).toHaveLength(2);
  });

  test('collects matched routes for nested layouts', () => {
    const parent = () => document.createElement('div');
    const child = () => document.createElement('span');
    const routes = defineRoutes({
      '/users': {
        component: parent,
        children: {
          '/:id': { component: child },
        },
      },
    });
    const match = matchRoute(routes, '/users/42');
    expect(match).not.toBeNull();
    expect(match?.matched).toHaveLength(2);
    expect(match?.matched[0]?.route.component).toBe(parent);
    expect(match?.matched[1]?.route.component).toBe(child);
  });

  test('extracts search params from URL', () => {
    const routes = defineRoutes({
      '/users': { component: () => document.createElement('div') },
    });
    const match = matchRoute(routes, '/users?page=3&sort=name');
    expect(match).not.toBeNull();
    expect(match?.searchParams.get('page')).toBe('3');
    expect(match?.searchParams.get('sort')).toBe('name');
  });

  test('matches route with error component', () => {
    const errorComp = ({ error }: { error: Error; retry: () => void }) =>
      document.createElement('div');
    const routes = defineRoutes({
      '/users': {
        component: () => document.createElement('div'),
        errorComponent: errorComp,
      },
    });
    const match = matchRoute(routes, '/users');
    expect(match).not.toBeNull();
    expect(match?.route.errorComponent).toBe(errorComp);
  });
});

describe('defineRoutes with params schema', () => {
  test('stores params schema on compiled route', () => {
    const schema: ParamSchema<{ id: string }> = {
      parse(raw) {
        const { id } = raw as { id: string };
        return { ok: true, data: { id } };
      },
    };
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => document.createElement('div'),
        params: schema,
      },
    });
    expect(routes[0]?.params).toBe(schema);
  });

  test('compiled route has no params schema when not provided', () => {
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => document.createElement('div'),
      },
    });
    expect(routes[0]?.params).toBeUndefined();
  });
});

describe('defineRoutes with prerender', () => {
  test('propagates prerender: false to CompiledRoute', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': { component: () => document.createElement('div'), prerender: false },
    });
    expect(routes[0]?.prerender).toBeUndefined();
    expect(routes[1]?.prerender).toBe(false);
  });

  test('propagates prerender: true to CompiledRoute', () => {
    const routes = defineRoutes({
      '/about': { component: () => document.createElement('div'), prerender: true },
    });
    expect(routes[0]?.prerender).toBe(true);
  });

  test('propagates prerender to nested children', () => {
    const routes = defineRoutes({
      '/docs': {
        component: () => document.createElement('div'),
        children: {
          '/': { component: () => document.createElement('div') },
          '/api': { component: () => document.createElement('div'), prerender: false },
        },
      },
    });
    expect(routes[0]?.children?.[0]?.prerender).toBeUndefined();
    expect(routes[0]?.children?.[1]?.prerender).toBe(false);
  });

  test('propagates generateParams to CompiledRoute', () => {
    const gen = () => [{ slug: 'hello' }, { slug: 'world' }];
    const routes = defineRoutes({
      '/blog/:slug': {
        component: () => document.createElement('div'),
        generateParams: gen,
      },
    });
    expect(routes[0]?.generateParams).toBe(gen);
  });

  test('generateParams is undefined when not provided', () => {
    const routes = defineRoutes({
      '/about': { component: () => document.createElement('div'), prerender: true },
    });
    expect(routes[0]?.generateParams).toBeUndefined();
  });
});

describe('matchRoute with params schema', () => {
  const uuidSchema: ParamSchema<{ id: string }> = {
    parse(raw) {
      const { id } = raw as { id: string };
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) return { ok: false, error: `Invalid UUID: ${id}` };
      return { ok: true, data: { id } };
    },
  };

  test('sets parsedParams when schema succeeds', () => {
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => document.createElement('div'),
        params: uuidSchema,
      },
    });
    const match = matchRoute(routes, '/tasks/550e8400-e29b-41d4-a716-446655440000');
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(match!.parsedParams).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });

  test('returns null when schema rejects params', () => {
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => document.createElement('div'),
        params: uuidSchema,
      },
    });
    const match = matchRoute(routes, '/tasks/not-a-uuid');
    expect(match).toBeNull();
  });

  test('returns null when schema parse() throws', () => {
    const throwingSchema: ParamSchema<{ id: string }> = {
      parse() {
        throw new Error('unexpected');
      },
    };
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => document.createElement('div'),
        params: throwingSchema,
      },
    });
    const match = matchRoute(routes, '/tasks/123');
    expect(match).toBeNull();
  });

  test('no parsedParams when no schema is provided (backward compat)', () => {
    const routes = defineRoutes({
      '/tasks/:id': {
        component: () => document.createElement('div'),
      },
    });
    const match = matchRoute(routes, '/tasks/123');
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: '123' });
    expect(match!.parsedParams).toBeUndefined();
  });

  test('nested route: leaf schema receives all accumulated params', () => {
    const multiSchema: ParamSchema<{ userId: string; postId: string }> = {
      parse(raw) {
        const { userId, postId } = raw as { userId: string; postId: string };
        if (!userId || !postId) return { ok: false, error: 'missing params' };
        return { ok: true, data: { userId, postId } };
      },
    };
    const routes = defineRoutes({
      '/users/:userId': {
        component: () => document.createElement('div'),
        children: {
          '/posts/:postId': {
            component: () => document.createElement('span'),
            params: multiSchema,
          },
        },
      },
    });
    const match = matchRoute(routes, '/users/alice/posts/42');
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ userId: 'alice', postId: '42' });
    expect(match!.parsedParams).toEqual({ userId: 'alice', postId: '42' });
  });

  test('schema can transform param values', () => {
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
    const match = matchRoute(routes, '/items/42');
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: '42' });
    expect(match!.parsedParams).toEqual({ id: 42 });
  });
});
