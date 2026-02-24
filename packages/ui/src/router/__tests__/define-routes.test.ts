import { describe, expect, test } from 'bun:test';
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
    const errorComp = () => document.createElement('div');
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
