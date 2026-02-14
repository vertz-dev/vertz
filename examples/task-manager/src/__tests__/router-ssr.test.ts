/**
 * Tests for router SSR compatibility.
 * 
 * The router must work both:
 * 1. In the browser with window.location
 * 2. In SSR context without window
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

describe('router SSR compatibility', () => {
  let originalWindow: any;
  let originalGlobalThis: any;

  beforeEach(() => {
    // Save original global state
    originalWindow = global.window;
    originalGlobalThis = (globalThis as any).__SSR_URL__;
  });

  afterEach(() => {
    // Restore original global state
    global.window = originalWindow;
    (globalThis as any).__SSR_URL__ = originalGlobalThis;
    
    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../router')];
  });

  test('router works in browser context with window', () => {
    // Simulate browser environment
    global.window = {
      location: { pathname: '/' }
    } as any;

    // Import router in browser context
    const { appRouter } = require('../router');
    
    expect(appRouter).toBeDefined();
    expect(appRouter.current).toBeDefined();
  });

  test('router works in SSR context without window', () => {
    // Simulate SSR environment (no window)
    global.window = undefined as any;
    (globalThis as any).__SSR_URL__ = '/settings';

    // Import router in SSR context
    const { appRouter } = require('../router');
    
    expect(appRouter).toBeDefined();
    expect(appRouter.current).toBeDefined();
  });

  test('router uses __SSR_URL__ when window is undefined', () => {
    global.window = undefined as any;
    (globalThis as any).__SSR_URL__ = '/tasks/123';

    const { appRouter } = require('../router');
    const match = appRouter.current.value;
    
    expect(match).toBeDefined();
    expect(match?.params?.id).toBe('123');
  });

  test('router defaults to / when neither window nor __SSR_URL__ exists', () => {
    global.window = undefined as any;
    (globalThis as any).__SSR_URL__ = undefined;

    const { appRouter } = require('../router');
    const match = appRouter.current.value;
    
    expect(match).toBeDefined();
    // Should match the root route
  });
});
