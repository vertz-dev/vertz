import { describe, expect, it } from 'bun:test';
import { classifyRoutes } from '../src/tpr-routes.js';

describe('classifyRoutes', () => {
  it('classifies static prerender routes', () => {
    const routes = [
      { pattern: '/', component: () => null, prerender: true },
      { pattern: '/about', component: () => null, prerender: true },
    ];

    const result = classifyRoutes(routes);

    expect(result.static).toEqual(['/', '/about']);
    expect(result.dynamic).toEqual([]);
  });

  it('classifies dynamic routes (with :params)', () => {
    const routes = [
      { pattern: '/products/:id', component: () => null },
      { pattern: '/blog/:slug', component: () => null },
    ];

    const result = classifyRoutes(routes);

    expect(result.static).toEqual([]);
    expect(result.dynamic).toEqual(['/products/:id', '/blog/:slug']);
  });

  it('classifies routes with generateParams as dynamic', () => {
    const routes = [
      {
        pattern: '/products/:id',
        component: () => null,
        generateParams: async () => [{ id: '1' }, { id: '2' }],
      },
    ];

    const result = classifyRoutes(routes);

    // Has generateParams → it can be pre-rendered but still classified as dynamic
    expect(result.dynamic).toEqual(['/products/:id']);
  });

  it('excludes routes with prerender: false', () => {
    const routes = [
      { pattern: '/dashboard', component: () => null, prerender: false },
      { pattern: '/about', component: () => null, prerender: true },
    ];

    const result = classifyRoutes(routes);

    expect(result.static).toEqual(['/about']);
    expect(result.dynamic).toEqual([]);
    expect(result.excluded).toEqual(['/dashboard']);
  });

  it('handles nested routes', () => {
    const routes = [
      {
        pattern: '/',
        component: () => null,
        prerender: true,
        children: [
          { pattern: 'about', component: () => null, prerender: true },
          { pattern: 'products/:id', component: () => null },
        ],
      },
    ];

    const result = classifyRoutes(routes);

    expect(result.static).toEqual(['/', '/about']);
    expect(result.dynamic).toEqual(['/products/:id']);
  });

  it('classifies static routes without explicit prerender as dynamic', () => {
    // Routes without prerender: true and without :params are ambiguous —
    // they might need data. Classify as dynamic so TPR analytics decides.
    const routes = [{ pattern: '/contact', component: () => null }];

    const result = classifyRoutes(routes);

    expect(result.static).toEqual([]);
    expect(result.dynamic).toEqual(['/contact']);
  });

  it('joins child pattern "/" or "" to non-root parent as parent itself', () => {
    // Exercises joinPatterns where child is '/' or '' and parent is non-root
    const routes = [
      {
        pattern: '/admin',
        component: () => null,
        prerender: true,
        children: [
          { pattern: '/', component: () => null, prerender: true },
          { pattern: '', component: () => null, prerender: true },
        ],
      },
    ];

    const result = classifyRoutes(routes);

    // /admin itself + both children resolve to /admin
    expect(result.static).toEqual(['/admin', '/admin', '/admin']);
  });

  it('joins child pattern to non-root parent with slash normalization', () => {
    // Exercises joinPatterns where parent is non-root and child is a real segment
    const routes = [
      {
        pattern: '/admin',
        component: () => null,
        prerender: true,
        children: [
          { pattern: 'settings', component: () => null, prerender: true },
          { pattern: '/users', component: () => null, prerender: true },
        ],
      },
    ];

    const result = classifyRoutes(routes);

    // /admin itself + /admin/settings + /admin/users
    expect(result.static).toEqual(['/admin', '/admin/settings', '/admin/users']);
  });
});
