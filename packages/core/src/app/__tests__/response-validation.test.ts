import { describe, expect, it } from 'bun:test';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import { createApp } from '../app-builder';

describe('Response Schema Validation', () => {
  it('does not validate response when validateResponses is not set', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    // Response schema that expects { id: number }
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    // Handler returns wrong type (string instead of number)
    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 'not-a-number' }), // Wrong type!
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    // Should still return 200, no validation happens
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'not-a-number' });
  });

  it('does not validate response when validateResponses is false', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 'wrong-type' }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: false }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
  });

  it('validates response against schema when validateResponses is true', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    // Handler returns correct type - should pass validation
    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 42 }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 42 });
  });

  it('logs warning but returns response when validation fails with validateResponses true', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { id: unknown };
        if (typeof response.id !== 'number') {
          return { ok: false as const, error: new Error('id must be a number') };
        }
        return { ok: true as const, data: response };
      },
    };

    // Handler returns wrong type
    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 'not-a-number' }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    // Response should still be returned (backwards compatible)
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'not-a-number' });
  });

  it('validates nested response structure', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as { user: { name: unknown } };
        if (typeof response.user?.name !== 'string') {
          return { ok: false as const, error: new Error('user.name must be a string') };
        }
        return { ok: true as const, data: response };
      },
    };

    router.get('/', {
      response: responseSchema,
      handler: () => ({ user: { name: 'Alice' } }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { name: 'Alice' } });
  });

  it('handles array response validation', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

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

    router.get('/', {
      response: responseSchema,
      handler: () => [{ id: 1 }, { id: 2 }],
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('skips validation when route has no response schema defined', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    // No response schema - should not fail even with validateResponses: true
    router.get('/', {
      handler: () => ({ id: 'any-type' }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
  });
});
