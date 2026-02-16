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
    parse: (_value) => ({ id: 123 }),
    _output: {},
  };
  router.get('/:id', {
    params: paramsSchema,
    handler: (ctx) => {
      // ✅ Should infer id as number
      const id = ctx.params.id;
      // @ts-expect-error - id is number, not string
      const _wrongType = ctx.params.id;
      return { id };
    },
  });
}
// Test 2: Query type inference
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/api' });
  const querySchema = {
    parse: (_value) => ({ limit: 10, offset: 0 }),
    _output: {},
  };
  router.get('/', {
    query: querySchema,
    handler: (ctx) => {
      // ✅ Should infer as numbers
      const limit = ctx.query.limit;
      const offset = ctx.query.offset;
      // @ts-expect-error - limit is number, not string
      const _wrongType = ctx.query.limit;
      return { limit, offset };
    },
  });
}
// Test 3: Multiple schemas at once
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/api' });
  const paramsSchema = {
    parse: (_value) => ({ id: 123 }),
    _output: {},
  };
  const querySchema = {
    parse: (_value) => ({ page: 1 }),
    _output: {},
  };
  router.get('/:id', {
    params: paramsSchema,
    query: querySchema,
    handler: (ctx) => {
      // ✅ Both should infer correctly
      const id = ctx.params.id;
      const page = ctx.query.page;
      // @ts-expect-error - id is number, not string
      const _wrongId = ctx.params.id;
      // @ts-expect-error - page is number, not string
      const _wrongPage = ctx.query.page;
      return { id, page };
    },
  });
}
// Test 4: Path must start with /
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/users' });
  // @ts-expect-error - path must start with /
  router.get(':id', { handler: () => {} });
  // @ts-expect-error - empty string is not a valid path
  router.post('', { handler: () => {} });
  // @ts-expect-error - path without leading / is invalid
  router.put('users', { handler: () => {} });
  // Valid paths should compile without errors
  router.get('/', { handler: () => {} });
  router.get('/:id', { handler: () => {} });
  router.get('/:param/nested', { handler: () => {} });
  router.delete('/nested/:param/path', { handler: () => {} });
}
//# sourceMappingURL=router-type-inference.test-d.js.map
