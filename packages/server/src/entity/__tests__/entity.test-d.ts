import { d } from '@vertz/db';
import { describe, expectTypeOf, it } from 'vitest';
import { entity } from '../index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  authorId: d.uuid(),
});

const usersModel = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

// ---------------------------------------------------------------------------
// Access rules — valid CRUD operations
// ---------------------------------------------------------------------------

describe('entity() access rule types', () => {
  it('accepts false to disable an operation', () => {
    entity('users', {
      model: usersModel,
      access: { delete: false },
    });
  });

  it('accepts a function with ctx parameter', () => {
    entity('users', {
      model: usersModel,
      access: { list: (ctx) => ctx.authenticated() },
    });
  });

  it('accepts a function with ctx and row parameters', () => {
    entity('users', {
      model: usersModel,
      access: { update: (ctx, row) => row.id === ctx.userId },
    });
  });

  it('rejects true as an access rule value', () => {
    entity('users', {
      model: usersModel,
      access: {
        // @ts-expect-error — true is not a valid AccessRule, use a function
        list: true,
      },
    });
  });

  it('rejects unknown operation names without matching action', () => {
    entity('users', {
      model: usersModel,
      access: {
        // @ts-expect-error — 'fly' is not a valid CRUD operation or action name
        fly: () => true,
      },
    });
  });

  it('accepts custom action name in access when actions has that key', () => {
    entity('users', {
      model: usersModel,
      actions: {
        resetPassword: {
          input: {
            parse: (v: unknown) => ({ ok: true as const, data: v as { password: string } }),
          },
          output: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
          handler: async () => ({ ok: true }),
        },
      },
      access: {
        list: (ctx) => ctx.authenticated(),
        resetPassword: (ctx) => ctx.role('admin'),
      },
    });
  });

  it('rejects action name in access when actions does NOT have that key', () => {
    entity('users', {
      model: usersModel,
      actions: {
        resetPassword: {
          input: {
            parse: (v: unknown) => ({ ok: true as const, data: v as { password: string } }),
          },
          output: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
          handler: async () => ({ ok: true }),
        },
      },
      access: {
        // @ts-expect-error — 'complete' is not in actions
        complete: (ctx) => ctx.authenticated(),
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Before hooks — data types
// ---------------------------------------------------------------------------

describe('entity() before hook types', () => {
  it('before.create receives $create_input typed data', () => {
    entity('users', {
      model: usersModel,
      before: {
        create: (data, _ctx) => {
          // data should have email, name, passwordHash, role (input fields)
          // but NOT id (PK), createdAt/updatedAt (readOnly)
          data.email satisfies string;
          return data;
        },
      },
    });
  });

  it('before.create data does NOT have readOnly columns', () => {
    entity('users', {
      model: usersModel,
      before: {
        create: (data, _ctx) => {
          // @ts-expect-error — createdAt is readOnly, excluded from $create_input
          void data.createdAt;
          return data;
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// After hooks — result types
// ---------------------------------------------------------------------------

describe('entity() after hook types', () => {
  it('after.create receives $response typed result', () => {
    entity('users', {
      model: usersModel,
      after: {
        create: (result, _ctx) => {
          // result has response fields (no passwordHash — hidden)
          result.email satisfies string;
        },
      },
    });
  });

  it('after.create result does NOT have hidden columns', () => {
    entity('users', {
      model: usersModel,
      after: {
        create: (result, _ctx) => {
          // @ts-expect-error — passwordHash is hidden, excluded from $response
          void result.passwordHash;
        },
      },
    });
  });

  it('after.update receives prev and next $response typed results', () => {
    entity('users', {
      model: usersModel,
      after: {
        update: (prev, next, _ctx) => {
          prev.email satisfies string;
          next.email satisfies string;
        },
      },
    });
  });

  it('after.create return type is void', () => {
    type AfterCreateFn = NonNullable<
      NonNullable<Parameters<typeof entity<typeof usersModel>>[1]['after']>['create']
    >;
    type ReturnT = ReturnType<AfterCreateFn>;

    expectTypeOf<ReturnT>().toMatchTypeOf<void | Promise<void>>();
  });
});

// ---------------------------------------------------------------------------
// Custom actions — required properties
// ---------------------------------------------------------------------------

describe('entity() custom action types', () => {
  it('requires input, output, and handler on action definition', () => {
    entity('users', {
      model: usersModel,
      actions: {
        // @ts-expect-error — handler is missing
        resetPassword: {
          input: {
            parse: (v: unknown) => ({ ok: true as const, data: v as { password: string } }),
          },
          output: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Relations config — constrained to model relations
// ---------------------------------------------------------------------------

describe('entity() relations config types', () => {
  it('accepts valid relation names from model', () => {
    entity('users', {
      model: usersModel,
      relations: { posts: true },
    });
  });

  it('accepts false to exclude a relation', () => {
    entity('users', {
      model: usersModel,
      relations: { posts: false },
    });
  });

  it('accepts field narrowing on a relation', () => {
    entity('users', {
      model: usersModel,
      relations: { posts: { id: true, title: true } },
    });
  });

  it('rejects relation names not in model', () => {
    entity('users', {
      model: usersModel,
      relations: {
        // @ts-expect-error — 'comments' is not a relation on usersModel
        comments: true,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: full config compiles
// ---------------------------------------------------------------------------

describe('entity() full config integration', () => {
  it('compiles with all config options together', () => {
    entity('users', {
      model: usersModel,
      access: {
        list: (ctx) => ctx.authenticated(),
        get: (ctx) => ctx.authenticated(),
        create: (ctx) => ctx.role('admin'),
        update: (ctx, row) => row.id === ctx.userId || ctx.role('admin'),
        delete: false,
      },
      before: {
        create: (data, _ctx) => data,
        update: (data, _ctx) => data,
      },
      after: {
        create: (_result, _ctx) => {},
        delete: (_row, _ctx) => {},
      },
      relations: { posts: true },
    });
  });
});
