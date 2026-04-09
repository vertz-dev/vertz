import { describe, expect, it } from '@vertz/test';
import { createApp } from '../app-builder';

describe('Response Schema Validation', () => {
  it('does not validate response when validateResponses is not set', async () => {
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          responseSchema,
          handler: async () => ({ id: 'not-a-number' }) as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    // Should still return 200, no validation happens
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'not-a-number' });
  });

  it('does not validate response when validateResponses is false', async () => {
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    const app = createApp({
      validateResponses: false,
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          responseSchema,
          handler: async () => ({ id: 'wrong-type' }) as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
  });

  it('validates response against schema when validateResponses is true', async () => {
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    const app = createApp({
      validateResponses: true,
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          responseSchema,
          handler: async () => ({ id: 42 }) as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 42 });
  });

  it('logs warning but returns response when validation fails with validateResponses true', async () => {
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    const app = createApp({
      validateResponses: true,
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          responseSchema,
          handler: async () => ({ id: 'not-a-number' }) as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    // Response should still be returned (backwards compatible)
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'not-a-number' });
  });

  it('validates nested response structure', async () => {
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { user: { name: unknown } };
        if (typeof response.user?.name !== 'string') {
          return { ok: false as const, error: new Error('user.name must be a string') };
        }
        return { ok: true as const, data: response };
      },
    };

    const app = createApp({
      validateResponses: true,
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          responseSchema,
          handler: async () => ({ user: { name: 'Alice' } }) as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { name: 'Alice' } });
  });

  it('handles array response validation', async () => {
    const responseSchema = {
      parse: (value: unknown) => {
        const arr = value as unknown[];
        for (const item of arr) {
          if (typeof item !== 'object' || item === null || !('id' in item)) {
            return { ok: false as const, error: new Error('each item must have id') };
          }
        }
        return { ok: true as const, data: arr };
      },
    };

    const app = createApp({
      validateResponses: true,
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          responseSchema,
          handler: async () => [{ id: 1 }, { id: 2 }] as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('skips validation when route has no response schema defined', async () => {
    const app = createApp({
      validateResponses: true,
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          handler: async () => ({ id: 'any-type' }) as unknown as Response,
        },
      ],
    });

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
  });
});
