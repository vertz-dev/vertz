import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '../../exceptions';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import type { HandlerCtx } from '../../types/context';
import { createApp } from '../app-builder';

describe('Schema Validation', () => {
  it('validates and infers types from schema', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    // Schema with _output type for inference
    const paramsSchema = {
      parse: (value: unknown) => {
        const params = value as Record<string, string>;
        const id = Number(params.id);
        if (Number.isNaN(id))
          return { ok: false as const, error: new BadRequestException('Invalid id') };
        return { ok: true as const, data: { id } };
      },
      _output: {} as { id: number },
    };

    let receivedParams: unknown;
    router.get('/:id', {
      params: paramsSchema,
      handler: (ctx) => {
        receivedParams = ctx.params;
        // ✅ Type inference: ctx.params.id is number, not string
        const id: number = ctx.params.id;
        return { id };
      },
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users/42');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedParams).toEqual({ id: 42 }); // Parsed to number
    expect(await response.json()).toEqual({ id: 42 });
  });

  it('validates params using schema when provided', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

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
    router.get('/:id', {
      params: paramsSchema,
      handler: (ctx: HandlerCtx) => {
        receivedParams = ctx.params;
        return { success: true };
      },
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users/123');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedParams).toEqual({ id: 123 }); // Should be parsed to number
  });

  it('validates body using schema when provided', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

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
    router.post('/', {
      body: bodySchema,
      handler: (ctx: HandlerCtx) => {
        receivedBody = ctx.body;
        return { created: true };
      },
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

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
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const bodySchema = {
      parse: (value: unknown) => {
        const body = value as Record<string, unknown>;
        if (typeof body.name !== 'string' || body.name.length === 0) {
          return { ok: false as const, error: new BadRequestException('name is required') };
        }
        return { ok: true as const, data: { name: body.name } };
      },
    };

    router.post('/', {
      body: bodySchema,
      handler: () => ({ created: true }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await app.handler(request);

    expect(response.status).toBe(400);
  });

  it('validates query using schema when provided', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

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

    router.get('/', {
      query: querySchema,
      handler: () => ({ users: [] }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users?page=abc');
    const response = await app.handler(request);

    expect(response.status).toBe(400);
  });

  it('passes validated query to handler', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/users' });

    const querySchema = {
      parse: (value: unknown) => {
        const query = value as Record<string, unknown>;
        return { ok: true as const, data: { page: Number(query.page ?? 1) } };
      },
    };

    let receivedQuery: unknown;
    router.get('/', {
      query: querySchema,
      handler: (ctx: HandlerCtx) => {
        receivedQuery = ctx.query;
        return { users: [] };
      },
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/users?page=3');
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedQuery).toEqual({ page: 3 });
  });

  it('validates headers using schema when provided', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/data' });

    const headersSchema = {
      parse: (value: unknown) => {
        const headers = value as Record<string, unknown>;
        if (!headers['x-api-key']) {
          return { ok: false as const, error: new BadRequestException('x-api-key is required') };
        }
        return { ok: true as const, data: { 'x-api-key': headers['x-api-key'] } };
      },
    };

    router.get('/', {
      headers: headersSchema,
      handler: () => ({ data: [] }),
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/data');
    const response = await app.handler(request);

    expect(response.status).toBe(400);
  });

  it('passes validated headers to handler', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/data' });

    const headersSchema = {
      parse: (value: unknown) => {
        const headers = value as Record<string, unknown>;
        return { ok: true as const, data: { 'x-api-key': headers['x-api-key'] } };
      },
    };

    let receivedHeaders: unknown;
    router.get('/', {
      headers: headersSchema,
      handler: (ctx: HandlerCtx) => {
        receivedHeaders = ctx.headers;
        return { data: [] };
      },
    });

    const module = createModule(moduleDef, { services: [], routers: [router], exports: [] });
    const app = createApp({}).register(module);

    const request = new Request('http://localhost/data', {
      headers: { 'x-api-key': 'secret123' },
    });
    const response = await app.handler(request);

    expect(response.status).toBe(200);
    expect(receivedHeaders).toEqual({ 'x-api-key': 'secret123' });
  });
});
