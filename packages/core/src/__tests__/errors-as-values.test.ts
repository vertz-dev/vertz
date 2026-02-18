import { describe, expect, it } from 'vitest';
import { createApp } from '../app/app-builder';
import { createModule } from '../module/module';
import { createModuleDef } from '../module/module-def';
import { err, ok } from '../result';
import type { HandlerCtx } from '../types/context';

interface TestRoute {
  method: string;
  path: string;
  handler: (ctx: HandlerCtx) => unknown;
  errors?: Record<number, unknown>;
}

function createTestModule(name: string, prefix: string, routes: TestRoute[]) {
  const moduleDef = createModuleDef({ name });
  const router = moduleDef.router({ prefix });
  for (const route of routes) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'patch'
      | 'delete'
      | 'head';
    router[method](route.path, {
      handler: route.handler,
      // @ts-expect-error - errors is not yet fully typed but we want to test it
      errors: route.errors,
    });
  }
  return createModule(moduleDef, { services: [], routers: [router], exports: [] });
}

describe('errors-as-values in route handlers', () => {
  describe('Handler returning ok(data)', () => {
    it('produces 200 response with data', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/:id',
          handler: async () => {
            return ok({ id: 1, name: 'John' });
          },
        },
      ]);

      const app = createApp({ basePath: '/api' }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users/1'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 1, name: 'John' });
    });
  });

  describe('Handler returning err(status, body)', () => {
    it('produces 404 response with error body', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/:id',
          handler: async () => {
            return err(404, { message: 'User not found' });
          },
        },
      ]);

      const app = createApp({ basePath: '/api' }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: 'User not found' });
    });

    it('produces 409 response for conflict', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'POST',
          path: '/',
          handler: async () => {
            return err(409, { message: 'Username already exists', conflictId: '123' });
          },
        },
      ]);

      const app = createApp({ basePath: '/api' }).register(mod);
      const res = await app.handler(
        new Request('http://localhost/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'john' }),
        }),
      );

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        message: 'Username already exists',
        conflictId: '123',
      });
    });
  });

  describe('Handler returning plain object (backwards compat)', () => {
    it('still produces 200 response', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/',
          handler: async () => {
            return { users: [{ id: 1, name: 'John' }] };
          },
        },
      ]);

      const app = createApp({ basePath: '/api' }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ users: [{ id: 1, name: 'John' }] });
    });
  });

  describe('Handler throwing exception (backwards compat)', () => {
    it('still produces error response', async () => {
      const { NotFoundException } = await import('../exceptions');

      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/:id',
          handler: async () => {
            throw new NotFoundException('User not found');
          },
        },
      ]);

      const app = createApp({ basePath: '/api' }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.message).toBe('User not found');
    });
  });

  describe('Error schemas validation', () => {
    // Mock schema that validates
    const mockSchema = {
      parse: (value: unknown) => {
        if (typeof value === 'object' && value !== null && 'message' in value) {
          return value;
        }
        throw new Error('Invalid schema');
      },
    };

    it('validates error response when validateResponses is true', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/:id',
          errors: {
            404: mockSchema,
          },
          handler: async () => {
            return err(404, { message: 'Not found' });
          },
        },
      ]);

      const app = createApp({ basePath: '/api', validateResponses: true }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(404);
    });

    it('allows multiple error status codes to be defined', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/:id',
          errors: {
            404: mockSchema,
            403: mockSchema,
            409: {
              parse: (value: unknown) => {
                if (
                  typeof value === 'object' &&
                  value !== null &&
                  'message' in value &&
                  'conflictId' in value
                ) {
                  return value;
                }
                throw new Error('Invalid schema');
              },
            },
          },
          handler: async () => {
            // Can return any of the defined errors
            return err(409, { message: 'Conflict', conflictId: '123' });
          },
        },
      ]);

      const app = createApp({ basePath: '/api', validateResponses: true }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ message: 'Conflict', conflictId: '123' });
    });

    it('validates ok response against response schema when validateResponses is true', async () => {
      const mod = createTestModule('test', '/users', [
        {
          method: 'GET',
          path: '/:id',
          handler: async () => {
            return ok({ id: 1, name: 'John' });
          },
        },
      ]);

      const app = createApp({ basePath: '/api', validateResponses: true }).register(mod);
      const res = await app.handler(new Request('http://localhost/api/users/1'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 1, name: 'John' });
    });
  });
});
