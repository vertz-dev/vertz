import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { createMiddleware } from '@vertz/server';

import { createTestApp } from '../test-app';

describe('createTestApp', () => {
  it('returns a builder with mockMiddleware and HTTP methods', () => {
    const app = createTestApp();

    expect(app.mockMiddleware).toBeFunction();
    expect(app.get).toBeFunction();
    expect(app.post).toBeFunction();
    expect(app.put).toBeFunction();
    expect(app.patch).toBeFunction();
    expect(app.delete).toBeFunction();
    expect(app.head).toBeFunction();
  });

  it('executes a GET request and returns response', async () => {
    const app = createTestApp({
      routes: [{ method: 'GET', path: '/users', handler: () => ({ users: ['Jane', 'John'] }) }],
    });

    const res = await app.get('/users');

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.body).toEqual({ users: ['Jane', 'John'] });
  });

  it('executes a POST request with body', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'POST',
          path: '/users',
          handler: (ctx) => ({ created: (ctx.body as Record<string, unknown>).name }),
        },
      ],
    });

    const res = await app.post('/users', { body: { name: 'Alice' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 'Alice' });
  });

  it('passes route params to handler via ctx', async () => {
    const app = createTestApp({
      routes: [
        { method: 'GET', path: '/users/:id', handler: (ctx) => ({ userId: ctx.params.id }) },
      ],
    });

    const res = await app.get('/users/42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: '42' });
  });

  it('returns 404 for unmatched route', async () => {
    const app = createTestApp({
      routes: [{ method: 'GET', path: '/users', handler: () => ({ ok: true }) }],
    });

    const res = await app.get('/not-found');

    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });

  it('passes env overrides to handler via ctx', async () => {
    const app = createTestApp({
      routes: [
        { method: 'GET', path: '/api', handler: (ctx) => ({ dbUrl: ctx.env.DATABASE_URL }) },
      ],
    }).env({ DATABASE_URL: 'postgres://test' });

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dbUrl: 'postgres://test' });
  });

  it('uses mocked middleware result instead of running real middleware', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => {
        throw new Error('should not run');
      },
    });

    const app = createTestApp({
      routes: [{ method: 'GET', path: '/api', handler: (ctx) => ({ user: ctx.user }) }],
    }).mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } });

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: '1', role: 'admin' } });
  });

  it('supports per-request middleware override', async () => {
    const authMiddleware = createMiddleware({
      name: 'auth',
      handler: () => {
        throw new Error('should not run');
      },
    });

    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          handler: (ctx) => ({ role: (ctx.user as Record<string, string>).role }),
        },
      ],
    }).mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } });

    // Per-request override — different user role
    const res = await app
      .get('/api')
      .mockMiddleware(authMiddleware, { user: { id: '2', role: 'viewer' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: 'viewer' });
  });

  it('passes custom headers to handler via ctx', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          handler: (ctx) => ({ token: ctx.headers.authorization }),
        },
      ],
    });

    const res = await app.get('/api', { headers: { authorization: 'Bearer test-token' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'Bearer test-token' });
  });

  it('executes a PUT request with body', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'PUT',
          path: '/users/:id',
          handler: (ctx) => ({
            updated: ctx.params.id,
            name: (ctx.body as Record<string, unknown>).name,
          }),
        },
      ],
    });

    const res = await app.put('/users/42', { body: { name: 'Updated' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: '42', name: 'Updated' });
  });

  it('executes a PATCH request with body', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'PATCH',
          path: '/users/:id',
          handler: (ctx) => ({
            patched: ctx.params.id,
            email: (ctx.body as Record<string, unknown>).email,
          }),
        },
      ],
    });

    const res = await app.patch('/users/42', { body: { email: 'new@test.com' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patched: '42', email: 'new@test.com' });
  });

  it('executes a DELETE request', async () => {
    const app = createTestApp({
      routes: [
        { method: 'DELETE', path: '/users/:id', handler: (ctx) => ({ deleted: ctx.params.id }) },
      ],
    });

    const res = await app.delete('/users/42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: '42' });
  });

  it('executes a HEAD request', async () => {
    const app = createTestApp({
      routes: [{ method: 'HEAD', path: '/health', handler: () => ({ ok: true }) }],
    });

    const res = await app.head('/health');

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  it('passes when handler return matches response schema', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          responseSchema: s.object({ name: s.string() }),
          handler: () => ({ name: 'Alice' }),
        },
      ],
    });

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Alice' });
  });

  it('skips validation when route has no response schema', async () => {
    const app = createTestApp({
      routes: [{ method: 'GET', path: '/api', handler: () => ({ anything: 'goes' }) }],
    });

    const res = await app.get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ anything: 'goes' });
  });

  it('throws when handler returns undefined but route has response schema', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          responseSchema: s.object({ name: s.string() }),
          handler: () => undefined,
        },
      ],
    });

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow('Response validation failed');
  });

  it('throws when handler return does not match response schema', async () => {
    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          responseSchema: s.object({ name: s.string() }),
          handler: () => ({ name: 123 }),
        },
      ],
    });

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow('Response validation failed');
  });

  it('throws ResponseValidationError with error message from safeParse', async () => {
    const responseSchema = {
      safeParse: (value: unknown) => {
        const v = value as { name: unknown };
        if (typeof v?.name !== 'string') {
          return { ok: false as const, error: { message: 'name must be a string' } };
        }
        return { ok: true as const };
      },
    };

    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          responseSchema,
          handler: () => ({ name: 42 }),
        },
      ],
    });

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow(
      'Response validation failed: name must be a string',
    );
  });

  it('throws ResponseValidationError with fallback message when error has no message', async () => {
    const responseSchema = {
      safeParse: () => {
        return { ok: false as const };
      },
    };

    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/api',
          responseSchema,
          handler: () => ({ name: 42 }),
        },
      ],
    });

    await expect(Promise.resolve(app.get('/api'))).rejects.toThrow(
      'Response validation failed: Unknown validation error',
    );
  });

  it('validates body using schema and rejects invalid input', async () => {
    const bodySchema = s.object({ name: s.string() });

    const app = createTestApp({
      routes: [
        {
          method: 'POST',
          path: '/users',
          bodySchema,
          handler: () => ({ created: true }),
        },
      ],
    });

    const res = await app.post('/users', { body: { name: 123 } });

    expect(res.status).toBe(400);
  });

  it('validates query using schema and rejects invalid input', async () => {
    const querySchema = {
      parse: (value: unknown) => {
        const query = value as Record<string, unknown>;
        const page = Number(query.page);
        if (Number.isNaN(page))
          return { ok: false as const, error: new Error('page must be a number') };
        return { ok: true as const, data: { page } };
      },
    };

    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/users',
          querySchema,
          handler: () => ({ users: [] }),
        },
      ],
    });

    const res = await app.get('/users?page=abc');

    expect(res.status).toBe(400);
  });

  it('validates headers using schema and rejects invalid input', async () => {
    const headersSchema = {
      parse: (value: unknown) => {
        const headers = value as Record<string, unknown>;
        if (!headers['x-api-key'])
          return { ok: false as const, error: new Error('x-api-key is required') };
        return { ok: true as const, data: headers };
      },
    };

    const app = createTestApp({
      routes: [
        {
          method: 'GET',
          path: '/data',
          headersSchema,
          handler: () => ({ data: [] }),
        },
      ],
    });

    const res = await app.get('/data');

    expect(res.status).toBe(400);
  });
});
