/**
 * Type-level tests for query parameter hints (Issue #180)
 *
 * When a route defines query params via schema, ctx.query should be typed.
 * When no query schema is provided, ctx.query should default to Record<string, string>
 * (standard URL search params) rather than `unknown`.
 */
import { expectTypeOf } from 'vitest';
import { createModuleDef } from '../module-def';

// Test 1: No query schema → ctx.query defaults to Record<string, string>
{
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/api' });
  router.get('/', {
    handler: (ctx) => {
      // Should be Record<string, string> — usable with string indexing
      expectTypeOf(ctx.query).toEqualTypeOf();
    },
  });
}
// Test 2: With query schema → ctx.query is typed from the schema
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
      expectTypeOf(ctx.query).toEqualTypeOf();
    },
  });
}
//# sourceMappingURL=query-param-hints.test-d.js.map
