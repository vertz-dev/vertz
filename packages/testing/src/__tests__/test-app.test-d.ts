import { createMiddleware, createModuleDef } from '@vertz/core';
import { describe, it } from 'vitest';

import { createTestApp } from '../test-app';

describe('createTestApp type safety', () => {
  it('rejects wrong service mock key', () => {
    const moduleDef = createModuleDef({ name: 'typed' });
    const service = moduleDef.service({
      methods: () => ({ greet: (name: string) => `hello ${name}` }),
    });

    const app = createTestApp();
    // @ts-expect-error — 'unknown' is not a key on the service methods
    app.mock(service, { unknown: () => 'bad' });
  });

  it('accepts correct service mock shape', () => {
    const moduleDef = createModuleDef({ name: 'typed' });
    const service = moduleDef.service({
      methods: () => ({ greet: (name: string) => `hello ${name}`, count: () => 42 }),
    });

    const app = createTestApp();
    // Should compile — partial mock with correct method signature
    app.mock(service, { greet: () => 'mocked' });
  });

  it('accepts correct middleware mock shape', () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => ({ user: { id: '1', role: 'admin' } }),
    });

    const app = createTestApp();
    // Should compile — result matches handler return type
    app.mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } });
  });

  it('rejects wrong middleware mock shape', () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => ({ user: { id: '1', role: 'admin' } }),
    });

    const app = createTestApp();
    // @ts-expect-error — 'wrong' is not a valid key on the middleware provides
    app.mockMiddleware(authMiddleware, { wrong: 'data' });
  });
});
