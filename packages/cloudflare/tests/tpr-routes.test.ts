import { describe, expect, it, mock } from 'bun:test';
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
});
