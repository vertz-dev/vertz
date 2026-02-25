import { defineTheme } from '@vertz/ui';
import { describe, expect, it } from 'vitest';
import { registerSSRQuery } from '../ssr-context';
import { ssrDiscoverQueries, ssrRenderToString } from '../ssr-render';

describe('ssrRenderToString', () => {
  it('returns { html, css, ssrData } shape', async () => {
    const module = {
      default: () => {
        // Simple component that returns a div
        const el = document.createElement('div');
        el.textContent = 'Hello SSR';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('css');
    expect(result).toHaveProperty('ssrData');
    expect(typeof result.html).toBe('string');
    expect(typeof result.css).toBe('string');
    expect(Array.isArray(result.ssrData)).toBe(true);
    expect(result.html).toContain('Hello SSR');
  });

  it('two-pass rendering resolves queries and includes data in ssrData', async () => {
    let callCount = 0;
    const module = {
      default: () => {
        callCount++;
        if (callCount === 1) {
          // Pass 1: register a query
          const resolve = (_data: unknown) => {};
          registerSSRQuery({
            key: 'tasks',
            promise: Promise.resolve({ items: ['task1', 'task2'] }),
            timeout: 300,
            resolve,
          });
        }
        const el = document.createElement('div');
        el.textContent = `Render pass ${callCount}`;
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    expect(callCount).toBe(2); // Two passes
    expect(result.ssrData).toHaveLength(1);
    expect(result.ssrData[0].key).toBe('tasks');
    expect(result.ssrData[0].data).toEqual({ items: ['task1', 'task2'] });
    expect(result.html).toContain('Render pass 2');
  });

  it('includes compiled theme CSS when module exports theme', async () => {
    const theme = defineTheme({
      colors: {
        primary: { DEFAULT: '#3b82f6' },
        background: { DEFAULT: '#ffffff' },
      },
    });

    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'Themed';
        return el;
      },
      theme,
    };

    const result = await ssrRenderToString(module, '/');

    expect(result.css).toContain('--color-primary');
    expect(result.css).toContain('--color-background');
    expect(result.css).toContain('data-vertz-css');
  });

  it('respects ssrTimeout — slow query not included in ssrData', async () => {
    const module = {
      default: () => {
        // Register a query that takes too long
        registerSSRQuery({
          key: 'slow-query',
          promise: new Promise((resolve) => setTimeout(() => resolve({ data: 'late' }), 5000)),
          timeout: 50, // 50ms timeout
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/', { ssrTimeout: 50 });

    // Slow query should have timed out and not be included
    expect(result.ssrData).toHaveLength(0);
    expect(result.html).toContain('App');
  });
});

describe('ssrDiscoverQueries', () => {
  it('returns resolved query data without rendering HTML', async () => {
    let callCount = 0;
    const module = {
      default: () => {
        callCount++;
        registerSSRQuery({
          key: 'tasks',
          promise: Promise.resolve({ items: ['a', 'b'] }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const result = await ssrDiscoverQueries(module, '/tasks');

    // Only Pass 1 — called once
    expect(callCount).toBe(1);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].key).toBe('tasks');
    expect(result.resolved[0].data).toEqual({ items: ['a', 'b'] });
  });
});

describe('per-request isolation', () => {
  it('concurrent ssrRenderToString calls do not interfere', async () => {
    const makeModule = (label: string) => ({
      default: () => {
        registerSSRQuery({
          key: `query-${label}`,
          promise: Promise.resolve({ label }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = label;
        return el;
      },
    });

    const [result1, result2] = await Promise.all([
      ssrRenderToString(makeModule('A'), '/a'),
      ssrRenderToString(makeModule('B'), '/b'),
    ]);

    // Each result should only have its own query
    expect(result1.ssrData).toHaveLength(1);
    expect(result1.ssrData[0].key).toBe('query-A');
    expect(result1.html).toContain('A');

    expect(result2.ssrData).toHaveLength(1);
    expect(result2.ssrData[0].key).toBe('query-B');
    expect(result2.html).toContain('B');
  });
});
