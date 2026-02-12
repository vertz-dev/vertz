/**
 * Type-level tests for inject type flow through router handlers.
 *
 * Verifies that service types injected via `.router({ inject: { ... } })`
 * are preserved and available in handler ctx without manual casting.
 *
 * Issue: #178
 */

import { createModuleDef } from '../module-def';
import type { ExtractMethods, ResolveInjectMap } from '../router-def';
import type { NamedServiceDef } from '../service';
import { createServiceDef } from '../service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

type UserMethods = {
  list: (opts: { limit: number; offset: number }) => { id: string; name: string }[];
  create: (data: { name: string; email: string }) => { id: string; name: string };
  getById: (id: string) => { id: string; name: string } | null;
};

type TaskMethods = {
  list: () => { id: string; title: string }[];
  create: (data: { title: string }) => { id: string; title: string };
};

// ---------------------------------------------------------------------------
// Test 1: ExtractMethods utility type
// ---------------------------------------------------------------------------

// Test 1a: ExtractMethods extracts TMethods from NamedServiceDef
{
  type Result = ExtractMethods<NamedServiceDef<unknown, unknown, UserMethods>>;
  const r: Result = {} as UserMethods;
  const _list: UserMethods['list'] = r.list;

  // @ts-expect-error - Result has UserMethods shape, not string
  const _wrong: string = r;
}

// Test 1b: ExtractMethods on non-service type returns unknown
{
  type Result = ExtractMethods<{ foo: string }>;
  const r: Result = {} as unknown;

  // Result is unknown — any assignment should work (unknown allows nothing specific)
  // @ts-expect-error - unknown is not assignable to string
  const _wrong: string = r;
}

// ---------------------------------------------------------------------------
// Test 2: ResolveInjectMap utility type
// ---------------------------------------------------------------------------

// Test 2a: ResolveInjectMap maps service defs to their methods
{
  type InjectMap = {
    userService: NamedServiceDef<unknown, unknown, UserMethods>;
    taskService: NamedServiceDef<unknown, unknown, TaskMethods>;
  };

  type Result = ResolveInjectMap<InjectMap>;

  const r: Result = {} as {
    userService: UserMethods;
    taskService: TaskMethods;
  };

  const _list: UserMethods['list'] = r.userService.list;
  const _create: TaskMethods['create'] = r.taskService.create;

  // @ts-expect-error - userService has UserMethods, not a string
  const _wrong: string = r.userService;
}

// ---------------------------------------------------------------------------
// Test 3: Inject types flow into handler ctx
// ---------------------------------------------------------------------------

// Test 3a: Single service injected — handler ctx has typed service methods
{
  const moduleDef = createModuleDef({ name: 'test' });

  const userService = createServiceDef('test', {
    methods: (): UserMethods => ({
      list: (opts) => [{ id: '1', name: `User (limit=${opts.limit})` }],
      create: (data) => ({ id: '2', name: data.name }),
      getById: (id) => ({ id, name: 'Test' }),
    }),
  });

  moduleDef.router({ prefix: '/users', inject: { userService } }).get('/', {
    handler: (ctx) => {
      // ctx.userService should be typed as UserMethods
      const result = ctx.userService.list({ limit: 10, offset: 0 });
      // biome-ignore lint/style/noNonNullAssertion: type-level test — asserting array element type
      const _item: { id: string; name: string } = result[0]!;

      // @ts-expect-error - list requires an argument
      ctx.userService.list();

      // @ts-expect-error - nonExistentMethod does not exist on UserMethods
      ctx.userService.nonExistentMethod();

      return result;
    },
  });
}

// Test 3b: Multiple services injected — handler ctx has all service methods
{
  const moduleDef = createModuleDef({ name: 'test' });

  const userService = createServiceDef('test', {
    methods: (): UserMethods => ({
      list: (opts) => [{ id: '1', name: `User (limit=${opts.limit})` }],
      create: (data) => ({ id: '2', name: data.name }),
      getById: (id) => ({ id, name: 'Test' }),
    }),
  });

  const taskService = createServiceDef('test', {
    methods: (): TaskMethods => ({
      list: () => [{ id: '1', title: 'Task 1' }],
      create: (data) => ({ id: '2', title: data.title }),
    }),
  });

  moduleDef.router({ prefix: '/api', inject: { userService, taskService } }).get('/', {
    handler: (ctx) => {
      // Both services should be fully typed
      const users = ctx.userService.list({ limit: 10, offset: 0 });
      const tasks = ctx.taskService.list();

      // biome-ignore lint/style/noNonNullAssertion: type-level test — asserting array element type
      const _user: { id: string; name: string } = users[0]!;
      // biome-ignore lint/style/noNonNullAssertion: type-level test — asserting array element type
      const _task: { id: string; title: string } = tasks[0]!;

      // @ts-expect-error - taskService does not have getById
      ctx.taskService.getById('1');

      return { users, tasks };
    },
  });
}

// ---------------------------------------------------------------------------
// Test 4: Backward compatibility — router without inject still works
// ---------------------------------------------------------------------------

// Test 4a: Router without inject — handler ctx works as before
{
  const moduleDef = createModuleDef({ name: 'test' });

  moduleDef.router({ prefix: '/health' }).get('/', {
    handler: (ctx) => {
      // Standard ctx properties should still work
      const _raw = ctx.raw;
      return { status: 'ok' };
    },
  });
}

// Test 4b: Router with empty inject — no type errors
{
  const moduleDef = createModuleDef({ name: 'test' });

  moduleDef.router({ prefix: '/health', inject: {} }).get('/', {
    handler: () => {
      return { status: 'ok' };
    },
  });
}

// ---------------------------------------------------------------------------
// Test 5: Inject types compose with middleware types
// ---------------------------------------------------------------------------

{
  // Module with middleware providing { requestId: string }
  const moduleDef = createModuleDef<
    Record<string, unknown>,
    Record<string, unknown>,
    { requestId: string }
  >({ name: 'test' });

  const userService = createServiceDef('test', {
    methods: (): UserMethods => ({
      list: (opts) => [{ id: '1', name: `User (limit=${opts.limit})` }],
      create: (data) => ({ id: '2', name: data.name }),
      getById: (id) => ({ id, name: 'Test' }),
    }),
  });

  moduleDef.router({ prefix: '/users', inject: { userService } }).get('/', {
    handler: (ctx) => {
      // Both middleware provides AND inject map should be available
      const _reqId: string = ctx.requestId;
      const users = ctx.userService.list({ limit: 10, offset: 0 });

      // @ts-expect-error - requestId is string, not number
      const _wrongReqId: number = ctx.requestId;

      return { requestId: _reqId, users };
    },
  });
}

// ---------------------------------------------------------------------------
// Test 6: Chained routes preserve inject types
// ---------------------------------------------------------------------------

{
  const moduleDef = createModuleDef({ name: 'test' });

  const userService = createServiceDef('test', {
    methods: (): UserMethods => ({
      list: (opts) => [{ id: '1', name: `User (limit=${opts.limit})` }],
      create: (data) => ({ id: '2', name: data.name }),
      getById: (id) => ({ id, name: 'Test' }),
    }),
  });

  const paramsSchema = {
    parse: (_value: unknown) => ({ id: '123' as string }),
    _output: {} as { id: string },
  };

  moduleDef
    .router({ prefix: '/users', inject: { userService } })
    .get('/', {
      handler: (ctx) => {
        // First route — inject types preserved
        return ctx.userService.list({ limit: 10, offset: 0 });
      },
    })
    .get('/:id', {
      params: paramsSchema,
      handler: (ctx) => {
        // Second route — inject types still preserved
        const user = ctx.userService.getById(ctx.params.id);

        // @ts-expect-error - params.id is string, not number
        const _wrongId: number = ctx.params.id;

        return user;
      },
    })
    .post('/', {
      handler: (ctx) => {
        // Third route — inject types still preserved
        return ctx.userService.create({ name: 'test', email: 'test@test.com' });
      },
    });
}
