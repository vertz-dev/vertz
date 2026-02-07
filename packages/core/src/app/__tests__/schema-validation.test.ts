import { describe, expect, it } from 'vitest';
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
        if (Number.isNaN(id)) throw new BadRequestException('Invalid id');
        return { id };
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
          throw new BadRequestException('Invalid id');
        }
        return { id };
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
});
