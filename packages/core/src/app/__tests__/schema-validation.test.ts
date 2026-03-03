import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '../../exceptions';
import { createApp } from '../app-builder';

describe('Schema Validation', () => {
  it('validates and infers types from schema', async () => {
    const paramsSchema = {
      parse: (value: unknown) => {
        const params = value as Record<string, string>;
        const id = Number(params.id);
        if (Number.isNaN(id))
          return { ok: false as const, error: new BadRequestException('Invalid id') };
        return { ok: true as const, data: { id } };
      },
    };

    let receivedParams: unknown;
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users/:id',
          paramsSchema,
          handler: async (ctx) => {
            receivedParams = ctx.params;
            return new Response(JSON.stringify({ id: (ctx.params as { id: number }).id }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });

    const request = new Request('http://localhost/users/42');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedParams).toEqual({ id: 42 }); // Parsed to number
    expect(await response.json()).toEqual({ id: 42 });
  });

  it('validates params using schema when provided', async () => {
    const paramsSchema = {
      parse: (value: unknown) => {
        const params = value as Record<string, string>;
        const id = Number(params.id);
        if (Number.isNaN(id)) {
          return { ok: false as const, error: new BadRequestException('Invalid id') };
        }
        return { ok: true as const, data: { id } };
      },
    };

    let receivedParams: unknown;
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users/:id',
          paramsSchema,
          handler: async (ctx) => {
            receivedParams = ctx.params;
            return new Response(JSON.stringify({ success: true }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });

    const request = new Request('http://localhost/users/123');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedParams).toEqual({ id: 123 }); // Should be parsed to number
  });

  it('validates body using schema when provided', async () => {
    const bodySchema = {
      parse: (value: unknown) => {
        const body = value as Record<string, unknown>;
        if (typeof body.name !== 'string' || body.name.length === 0) {
          return { ok: false as const, error: new BadRequestException('name is required') };
        }
        return { ok: true as const, data: { name: body.name } };
      },
    };

    let receivedBody: unknown;
    const app = createApp({
      _entityRoutes: [
        {
          method: 'POST',
          path: '/users',
          bodySchema,
          handler: async (ctx) => {
            receivedBody = ctx.body;
            return new Response(JSON.stringify({ created: true }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });

    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedBody).toEqual({ name: 'Alice' });
  });

  it('rejects request when body fails schema validation', async () => {
    const bodySchema = {
      parse: (value: unknown) => {
        const body = value as Record<string, unknown>;
        if (typeof body.name !== 'string' || body.name.length === 0) {
          return { ok: false as const, error: new BadRequestException('name is required') };
        }
        return { ok: true as const, data: { name: body.name } };
      },
    };

    const app = createApp({
      _entityRoutes: [
        {
          method: 'POST',
          path: '/users',
          bodySchema,
          handler: async () =>
            new Response(JSON.stringify({ created: true }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });

    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await app.handler(request);

    expect(response.status).toBe(400);
  });

  it('validates query using schema when provided', async () => {
    const querySchema = {
      parse: (value: unknown) => {
        const query = value as Record<string, unknown>;
        if (query.page !== undefined) {
          const page = Number(query.page);
          if (Number.isNaN(page)) {
            return { ok: false as const, error: new BadRequestException('page must be a number') };
          }
          return { ok: true as const, data: { page } };
        }
        return { ok: true as const, data: {} };
      },
    };

    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          querySchema,
          handler: async () =>
            new Response(JSON.stringify({ users: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });

    const request = new Request('http://localhost/users?page=abc');
    const response = await app.handler(request);

    expect(response.status).toBe(400);
  });

  it('passes validated query to handler', async () => {
    const querySchema = {
      parse: (value: unknown) => {
        const query = value as Record<string, unknown>;
        return { ok: true as const, data: { page: Number(query.page ?? 1) } };
      },
    };

    let receivedQuery: unknown;
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/users',
          querySchema,
          handler: async (ctx) => {
            receivedQuery = ctx.query;
            return new Response(JSON.stringify({ users: [] }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });

    const request = new Request('http://localhost/users?page=3');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedQuery).toEqual({ page: 3 });
  });

  it('validates headers using schema when provided', async () => {
    const headersSchema = {
      parse: (value: unknown) => {
        const headers = value as Record<string, unknown>;
        if (!headers['x-api-key']) {
          return { ok: false as const, error: new BadRequestException('x-api-key is required') };
        }
        return { ok: true as const, data: { 'x-api-key': headers['x-api-key'] } };
      },
    };

    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/data',
          headersSchema,
          handler: async () =>
            new Response(JSON.stringify({ data: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
        },
      ],
    });

    const request = new Request('http://localhost/data');
    const response = await app.handler(request);

    expect(response.status).toBe(400);
  });

  it('passes validated headers to handler', async () => {
    const headersSchema = {
      parse: (value: unknown) => {
        const headers = value as Record<string, unknown>;
        return { ok: true as const, data: { 'x-api-key': headers['x-api-key'] } };
      },
    };

    let receivedHeaders: unknown;
    const app = createApp({
      _entityRoutes: [
        {
          method: 'GET',
          path: '/data',
          headersSchema,
          handler: async (ctx) => {
            receivedHeaders = ctx.headers;
            return new Response(JSON.stringify({ data: [] }), {
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      ],
    });

    const request = new Request('http://localhost/data', {
      headers: { 'x-api-key': 'secret123' },
    });
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedHeaders).toEqual({ 'x-api-key': 'secret123' });
  });
});
