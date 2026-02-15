import { describe, expect, it, vi } from 'vitest';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import type { HandlerCtx } from '../../types/context';
import { createApp } from '../app-builder';

describe('Response Schema Validation', () => {
  it('does NOT validate response by default (current behavior)', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    // Response schema expects { id: number; name: string }
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as Record<string, unknown>;
        if (typeof response.id !== 'number') {
          throw new Error('id must be a number');
        }
        if (typeof response.name !== 'string') {
          throw new Error('name must be a string');
        }
        return response;
      },
    };

    // Handler returns { id: 'invalid', name: 123 } - invalid!
    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 'invalid' as unknown as number, name: 123 }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    // Currently passes because response is NOT validated
    expect(response.status).toBe(200);
  });

  it('validates response when validateResponses is enabled', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    // Response schema expects { id: number; name: string }
    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as Record<string, unknown>;
        if (typeof response.id !== 'number') {
          throw new Error('id must be a number');
        }
        if (typeof response.name !== 'string') {
          throw new Error('name must be a string');
        }
        return response;
      },
    };

    // Handler returns invalid data
    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 'invalid' as unknown as number, name: 123 }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    // Response still succeeds (for backwards compatibility), but logs warning
    expect(response.status).toBe(200);

    // Should have logged a warning about validation failure
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('Response validation failed');

    warnSpy.mockRestore();
  });

  it('does not warn when response matches schema with validateResponses enabled', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as Record<string, unknown>;
        if (typeof response.id !== 'number') {
          throw new Error('id must be a number');
        }
        return response;
      },
    };

    // Handler returns valid data
    router.get('/', {
      response: responseSchema,
      handler: () => ({ id: 42 }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);

    // Should NOT have logged a warning
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('validates response schema and passes valid responses through', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const responseSchema = {
      parse: (value: unknown) => {
        const response = value as Record<string, unknown>;
        if (!response.id || typeof response.id !== 'number') {
          throw new Error('id must be a number');
        }
        return response;
      },
    };

    let receivedCtx: HandlerCtx | undefined;
    router.get('/', {
      response: responseSchema,
      handler: (ctx: HandlerCtx) => {
        receivedCtx = ctx;
        return { id: 1, extraField: 'should be allowed' };
      },
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({ validateResponses: true }).register(module);

    const request = new Request('http://localhost/users');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ id: 1, extraField: 'should be allowed' });

    // No warnings for valid response
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
