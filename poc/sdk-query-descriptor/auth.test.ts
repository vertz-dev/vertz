/**
 * POC Tests: BearerAuthHandle.
 *
 * Validates the auth abstraction works without exposing signals.
 */

import { describe, expect, test } from 'bun:test';
import { createBearerAuthHandle } from './auth';
import { createClient } from './simulated-sdk';

describe('BearerAuthHandle', () => {
  test('starts unauthenticated when no token provided', () => {
    const handle = createBearerAuthHandle();
    expect(handle.isAuthenticated).toBe(false);
    expect(handle._strategy.token()).toBeNull();
  });

  test('starts authenticated with static token', () => {
    const handle = createBearerAuthHandle('my-token');
    expect(handle.isAuthenticated).toBe(true);
    expect(handle._strategy.token()).toBe('my-token');
  });

  test('starts authenticated with function token', () => {
    let token: string | null = 'dynamic-token';
    const handle = createBearerAuthHandle(() => token);
    expect(handle.isAuthenticated).toBe(true);
    expect(handle._strategy.token()).toBe('dynamic-token');

    // Dynamic: changing the outer variable affects the handle
    token = null;
    expect(handle.isAuthenticated).toBe(false);
    expect(handle._strategy.token()).toBeNull();
  });

  test('setToken() sets the token', () => {
    const handle = createBearerAuthHandle();
    expect(handle.isAuthenticated).toBe(false);

    handle.setToken('new-token');
    expect(handle.isAuthenticated).toBe(true);
    expect(handle._strategy.token()).toBe('new-token');
  });

  test('clear() removes the token', () => {
    const handle = createBearerAuthHandle('initial-token');
    expect(handle.isAuthenticated).toBe(true);

    handle.clear();
    expect(handle.isAuthenticated).toBe(false);
    expect(handle._strategy.token()).toBeNull();
  });

  test('strategy type is always "bearer"', () => {
    const handle = createBearerAuthHandle();
    expect(handle._strategy.type).toBe('bearer');
  });
});

describe('createClient with auth', () => {
  test('client exposes auth handle', () => {
    const api = createClient({
      baseURL: '/api',
      auth: { token: 'my-token' },
    });

    expect(api.auth.isAuthenticated).toBe(true);
    expect(api.auth._strategy.type).toBe('bearer');
    expect(api.auth._strategy.token()).toBe('my-token');
  });

  test('client auth with dynamic token', () => {
    let storedToken: string | null = null;
    const api = createClient({
      baseURL: '/api',
      auth: { token: () => storedToken },
    });

    // No token set → unauthenticated
    expect(api.auth.isAuthenticated).toBe(false);

    // Simulate external token store update
    storedToken = 'stored-token';
    expect(api.auth.isAuthenticated).toBe(true);
    expect(api.auth._strategy.token()).toBe('stored-token');
  });

  test('client without auth creates empty handle', () => {
    const api = createClient({ baseURL: '/api' });

    expect(api.auth.isAuthenticated).toBe(false);
    api.auth.setToken('runtime-token');
    expect(api.auth.isAuthenticated).toBe(true);
  });

  test('login/logout flow', () => {
    const api = createClient({ baseURL: '/api' });

    // Login
    api.auth.setToken('jwt-token-123');
    expect(api.auth.isAuthenticated).toBe(true);
    expect(api.auth._strategy.token()).toBe('jwt-token-123');

    // Logout
    api.auth.clear();
    expect(api.auth.isAuthenticated).toBe(false);
    expect(api.auth._strategy.token()).toBeNull();
  });
});
