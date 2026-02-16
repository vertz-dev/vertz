/**
 * Type-level tests for middleware provides -> handler ctx inference
 *
 * These tests verify that middleware TProvides types flow into handler ctx
 * automatically, without manual casting.
 */
import { createMiddleware } from '../../middleware/middleware-def';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import { createApp } from '../app-builder';

// Test 1: Single middleware — handler return type infers TProvides
{
  const authMiddleware = createMiddleware({
    name: 'auth',
    handler: async () => ({ user: { id: '1', role: 'admin' } }),
  });
  const app = createApp({}).middlewares([authMiddleware]);
  // Register a module — the builder should maintain middleware type
  const moduleDef = createModuleDef({ name: 'test' });
  const router = moduleDef.router({ prefix: '/users' });
  const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });
  app.register(mod);
}
// Test 2: Multiple middleware accumulation via AccumulateProvides
void (function test2() {
  // Verify the resulting type has both fields
  const r = { user: { id: '1' }, requestId: 'abc' };
  const userId = r.user.id;
  const reqId = r.requestId;
  // @ts-expect-error - number is not assignable to { id: string }
  const _wrongUser = r.user;
  return { userId, reqId };
})();
// Test 3: Empty middleware list produces empty object
void (function test3() {
  const empty = {};
  return { empty };
})();
// Test 4: Single middleware in AccumulateProvides — complex type (db instance)
void (function test4() {
  const r = { db: { find: () => null } };
  const fn = r.db.find;
  return { fn };
})();
// Test 5: createApp().middlewares() returns AppBuilder with accumulated type
void (function test5() {
  const auth = createMiddleware({
    name: 'auth',
    handler: () => ({ user: { id: '1', role: 'admin' } }),
  });
  const reqId = createMiddleware({
    name: 'requestId',
    handler: () => ({ requestId: 'abc-123' }),
  });
  // Chaining middlewares should accumulate provides
  const app = createApp({}).middlewares([auth, reqId]);
  // The above should compile without errors — the AppBuilder is generic
  // over the accumulated middleware context
  return { app };
})();
// Test 6: Three middleware accumulation
void (function test6() {
  const r = { a: 1, b: 'hello', c: true };
  const a = r.a;
  const b = r.b;
  const c = r.c;
  // @ts-expect-error - 'a' is number, not string
  const _wrongA = r.a;
  return { a, b, c };
})();
// Test 7: Negative test — wrong type assignment from accumulated provides
void (function test7() {
  const r = { count: 42 };
  // @ts-expect-error - count is number, not string
  const _wrongCount = r.count;
  return { count: r.count };
})();
//# sourceMappingURL=middleware-ctx-inference.test-d.js.map
