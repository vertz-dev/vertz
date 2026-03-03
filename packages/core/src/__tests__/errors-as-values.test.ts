import { describe, expect, it } from 'bun:test';
import { createApp } from '../app/app-builder';
import { NotFoundException } from '../exceptions';
import { err, ok } from '../result';

describe('errors-as-values in route handlers', () => {
  describe('Handler returning ok(data)', () => {
    it('produces 200 response with data', async () => {
      const app = createApp({
        basePath: '/api',
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users/:id',
            handler: async () => ok({ id: 1, name: 'John' }) as unknown as Response,
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users/1'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 1, name: 'John' });
    });
  });

  describe('Handler returning err(status, body)', () => {
    it('produces 404 response with error body', async () => {
      const app = createApp({
        basePath: '/api',
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users/:id',
            handler: async () => err(404, { message: 'User not found' }) as unknown as Response,
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: 'User not found' });
    });

    it('produces 409 response for conflict', async () => {
      const app = createApp({
        basePath: '/api',
        _entityRoutes: [
          {
            method: 'POST',
            path: '/api/users',
            handler: async () =>
              err(409, {
                message: 'Username already exists',
                conflictId: '123',
              }) as unknown as Response,
          },
        ],
      });
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
      const app = createApp({
        basePath: '/api',
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users',
            handler: async () => ({ users: [{ id: 1, name: 'John' }] }) as unknown as Response,
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ users: [{ id: 1, name: 'John' }] });
    });
  });

  describe('Handler throwing exception (backwards compat)', () => {
    it('still produces error response', async () => {
      const app = createApp({
        basePath: '/api',
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users/:id',
            handler: async () => {
              throw new NotFoundException('User not found');
            },
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.message).toBe('User not found');
    });
  });

  describe('Error schemas validation', () => {
    const mockSchema = {
      parse: (value: unknown) => {
        if (typeof value === 'object' && value !== null && 'message' in value) {
          return { ok: true as const, data: value };
        }
        return { ok: false as const, error: new Error('Invalid schema') };
      },
    };

    it('validates error response when validateResponses is true', async () => {
      const app = createApp({
        basePath: '/api',
        validateResponses: true,
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users/:id',
            errorsSchema: { 404: mockSchema },
            handler: async () => err(404, { message: 'Not found' }) as unknown as Response,
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(404);
    });

    it('allows multiple error status codes to be defined', async () => {
      const conflictSchema = {
        parse: (value: unknown) => {
          if (
            typeof value === 'object' &&
            value !== null &&
            'message' in value &&
            'conflictId' in value
          ) {
            return { ok: true as const, data: value };
          }
          return { ok: false as const, error: new Error('Invalid schema') };
        },
      };

      const app = createApp({
        basePath: '/api',
        validateResponses: true,
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users/:id',
            errorsSchema: { 404: mockSchema, 403: mockSchema, 409: conflictSchema },
            handler: async () =>
              err(409, { message: 'Conflict', conflictId: '123' }) as unknown as Response,
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users/999'));

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ message: 'Conflict', conflictId: '123' });
    });

    it('validates ok response against response schema when validateResponses is true', async () => {
      const app = createApp({
        basePath: '/api',
        validateResponses: true,
        _entityRoutes: [
          {
            method: 'GET',
            path: '/api/users/:id',
            handler: async () => ok({ id: 1, name: 'John' }) as unknown as Response,
          },
        ],
      });
      const res = await app.handler(new Request('http://localhost/api/users/1'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 1, name: 'John' });
    });
  });
});
