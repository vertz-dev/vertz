/**
 * Focused tests for app-runner.ts response paths and error handling.
 *
 * These tests cover gaps left by app-builder.test.ts — specifically:
 * - Result Ok/Err type branching (errors-as-values pattern)
 * - Response instance passthrough with reference equality (HTML/file responses)
 * - Content-type assertions for ok() / err() results
 * - 405 Allow header with multiple methods registered
 * - validateSchema wrapping generic errors into BadRequestException
 * - Security: 500 does not leak internal error messages
 * - Non-Error thrown → 500
 *
 * Every assertion here verifies something a consumer integration-tests against.
 */

import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '../../exceptions';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import { err, ok } from '../../result';
import { createApp } from '../app-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModule(
  prefix: string,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head',
  path: string,
  handler: (ctx: unknown) => unknown,
) {
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix });
  router[method](path, { handler: handler as never });
  return createModule(moduleDef, { services: [], routers: [router], exports: [] });
}

// ---------------------------------------------------------------------------
// Result type — errors-as-values pattern
// ---------------------------------------------------------------------------

describe('Result type response handling', () => {
  it('returns 200 with data when handler returns ok(data)', async () => {
    const mod = makeModule('/items', 'get', '/', () => ok({ id: 1, name: 'widget' }));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/items'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1, name: 'widget' });
  });

  it('sets application/json content-type for ok() result', async () => {
    const mod = makeModule('/items', 'get', '/', () => ok({ x: 1 }));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/items'));

    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns the exact status from err(status, body)', async () => {
    const mod = makeModule('/items', 'get', '/:id', () => err(422, { code: 'Unprocessable' }));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/items/99'));

    expect(res.status).toBe(422);
  });

  it('returns the exact body from err(status, body)', async () => {
    const errorBody = { code: 'NotReady', message: 'Item not ready' };
    const mod = makeModule('/items', 'get', '/:id', () => err(409, errorBody));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/items/5'));

    expect(await res.json()).toEqual(errorBody);
  });

  it('err() body is serialized as application/json', async () => {
    const mod = makeModule('/items', 'get', '/', () => err(400, { field: 'name' }));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/items'));

    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ---------------------------------------------------------------------------
// Response instance passthrough
// ---------------------------------------------------------------------------

describe('Response instance passthrough', () => {
  it('returns the exact same Response object (reference equality)', async () => {
    const originalResponse = new Response('<h1>Hello</h1>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const mod = makeModule('/page', 'get', '/', () => originalResponse);
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/page'));

    expect(res).toBe(originalResponse);
  });

  it('returns a Response object directly without JSON wrapping', async () => {
    const originalResponse = new Response('<h1>Hello</h1>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const mod = makeModule('/page', 'get', '/', () => originalResponse);
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/page'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toBe('<h1>Hello</h1>');
  });

  it('preserves custom status code from returned Response', async () => {
    const originalResponse = new Response(null, { status: 202 });
    const mod = makeModule('/files', 'get', '/', () => originalResponse);
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/files'));

    expect(res).toBe(originalResponse);
    expect(res.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// Plain object responses — content-type
// ---------------------------------------------------------------------------

describe('Plain object response', () => {
  it('sets application/json content-type for plain object handler returns', async () => {
    const mod = makeModule('/users', 'get', '/', () => ({ users: [] }));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns 200 for plain object handler return', async () => {
    const mod = makeModule('/users', 'get', '/', () => ({ id: 7 }));
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 405 Method Not Allowed — Allow header with multiple methods
// ---------------------------------------------------------------------------

describe('405 Method Not Allowed', () => {
  it('includes all allowed methods in Allow header when multiple methods registered', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/items' });
    router.get('/', { handler: () => [] });
    router.post('/', { handler: () => ({}) });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

    const app = createApp({}).register(mod);
    const res = await app.handler(new Request('http://localhost/items', { method: 'DELETE' }));

    expect(res.status).toBe(405);
    const allowHeader = res.headers.get('allow') ?? '';
    const methods = allowHeader.split(',').map((m) => m.trim());
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });
});

// ---------------------------------------------------------------------------
// 500 Internal Server Error — security and non-Error throws
// ---------------------------------------------------------------------------

describe('500 Internal Server Error response body', () => {
  it('does not leak the original error message in 500 response', async () => {
    const mod = makeModule('/secret', 'get', '/', () => {
      throw new Error('db password: hunter2');
    });
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/secret'));
    const body = await res.json();

    // Internal error messages must NOT be exposed to the client
    expect(body.error.message).not.toContain('hunter2');
  });

  it('returns 500 when a non-Error value is thrown', async () => {
    const mod = makeModule('/users', 'get', '/', () => {
      // biome-ignore lint/suspicious/noExplicitAny: intentional non-Error throw for test
      throw 'string error' as any;
    });
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/users'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('InternalServerError');
  });
});

// ---------------------------------------------------------------------------
// Schema validation — generic Error wrapping into BadRequest
// ---------------------------------------------------------------------------

describe('Schema validation failure response body', () => {
  it('wraps generic Error from schema.parse into BadRequest (not 500)', async () => {
    // validateSchema() catches generic Errors and re-throws as BadRequestException.
    // This ensures a schema library throwing a plain Error still produces a 400.
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/data' });

    const paramsSchema = {
      parse: (_value: unknown) => {
        // Simulate a schema lib that throws a plain Error (not BadRequestException)
        throw new Error('id must be a positive integer');
      },
    };

    router.get('/:id', { params: paramsSchema, handler: () => ({}) });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(mod);

    const res = await app.handler(new Request('http://localhost/data/bad'));

    expect(res.status).toBe(400);
    const body = await res.json();
    // Message is taken from the original Error
    expect(body.error.message).toBe('id must be a positive integer');
    // Code must be BadRequest, not InternalServerError
    expect(body.error.code).toBe('BadRequest');
  });
});
