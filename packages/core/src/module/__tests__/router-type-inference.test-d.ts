/**
 * Type-level tests for route handler type inference
 *
 * These tests verify that handler ctx is correctly typed based on schemas.
 * Tests use @ts-expect-error to verify compile-time type safety.
 */

import { createModuleDef } from '../module-def';

// Test 1: Params type inference
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/users' });

  const paramsSchema = {
    parse: (_value: unknown) => ({ id: 123 as number }),
    _output: {} as { id: number },
  };

  router.get('/:id', {
    params: paramsSchema,
    handler: (ctx) => {
      // ✅ Should infer id as number
      const id: number = ctx.params.id;

      // @ts-expect-error - id is number, not string
      const _wrongType: string = ctx.params.id;

      return { id };
    },
  });
}

// Test 2: Query type inference
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/api' });

  const querySchema = {
    parse: (_value: unknown) => ({ limit: 10 as number, offset: 0 as number }),
    _output: {} as { limit: number; offset: number },
  };

  router.get('/', {
    query: querySchema,
    handler: (ctx) => {
      // ✅ Should infer as numbers
      const limit: number = ctx.query.limit;
      const offset: number = ctx.query.offset;

      // @ts-expect-error - limit is number, not string
      const _wrongType: string = ctx.query.limit;

      return { limit, offset };
    },
  });
}

// Test 3: Multiple schemas at once
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/api' });

  const paramsSchema = {
    parse: (_value: unknown) => ({ id: 123 as number }),
    _output: {} as { id: number },
  };

  const querySchema = {
    parse: (_value: unknown) => ({ page: 1 as number }),
    _output: {} as { page: number },
  };

  router.get('/:id', {
    params: paramsSchema,
    query: querySchema,
    handler: (ctx) => {
      // ✅ Both should infer correctly
      const id: number = ctx.params.id;
      const page: number = ctx.query.page;

      // @ts-expect-error - id is number, not string
      const _wrongId: string = ctx.params.id;

      // @ts-expect-error - page is number, not string
      const _wrongPage: string = ctx.query.page;

      return { id, page };
    },
  });
}
