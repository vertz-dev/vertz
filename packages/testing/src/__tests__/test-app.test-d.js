import { createMiddleware, createModuleDef } from '@vertz/server';
import { describe, it } from 'vitest';
import { createTestApp } from '../test-app';

describe('createTestApp type safety', () => {
  it('rejects wrong service mock key', () => {
    const moduleDef = createModuleDef({ name: 'typed' });
    const service = moduleDef.service({
      methods: () => ({ greet: (name) => `hello ${name}` }),
    });
    const app = createTestApp();
    // @ts-expect-error — 'unknown' is not a key on the service methods
    app.mock(service, { unknown: () => 'bad' });
  });
  it('accepts correct service mock shape', () => {
    const moduleDef = createModuleDef({ name: 'typed' });
    const service = moduleDef.service({
      methods: () => ({ greet: (name) => `hello ${name}`, count: () => 42 }),
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
describe('TestAppWithRoutes<TRouteMap> type safety', () => {
  it('creates typed test app with route map', () => {
    // Should compile — typed app created successfully
    createTestApp();
  });
  it('accepts valid GET /users route', () => {
    const app = createTestApp();
    // Should compile — valid route key
    app.get('/users');
  });
  it('accepts valid GET /users/:id route with param', () => {
    const app = createTestApp();
    // Should compile — valid route key with param
    app.get('/users/123');
  });
  it('accepts valid POST /users route with body type', () => {
    const app = createTestApp();
    // Should compile — valid POST route with body
    app.post('/users', { body: { name: 'Alice' } });
  });
  it('narrows body type for POST /users', () => {
    const app = createTestApp();
    // @ts-expect-error — wrong body type (missing required 'name')
    app.post('/users', { body: { wrong: 'field' } });
  });
  it('accepts correct body type for POST /users', () => {
    const app = createTestApp();
    // Should compile — correct body type
    app.post('/users', { body: { name: 'Alice' } });
  });
  it('backwards compatible when no type parameter', () => {
    // When no generic is provided, should fall back to untyped behavior
    const app = createTestApp();
    // Should compile — untyped request
    app.get('/any/path');
    app.post('/any/path', { body: { any: 'thing' } });
  });
});
describe('TestResponse type narrowing', () => {
  it('TestResponse can be used with generic type', () => {
    const response = {
      status: 200,
      body: { id: '123' },
      headers: {},
      ok: true,
    };
    // Should compile — typed response (accessing id works)
    void response.body.id;
  });
  it('TestResponse defaults to unknown when no type', () => {
    const response = {
      status: 200,
      body: { id: '123' },
      headers: {},
      ok: true,
    };
    // Should compile — untyped response
    void response.body;
  });
});
//# sourceMappingURL=test-app.test-d.js.map
