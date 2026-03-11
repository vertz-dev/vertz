import { describe, it } from 'bun:test';
import { d } from '@vertz/db';
import { entity } from '../entity';

// Type helpers for type-level assertions
type Expect<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

// ===========================================================================
// E2E Type Tests — EDA v0.1.0
//
// Validates compile-time type safety across the full EDA pipeline:
// schema → model → entity → type inference
// ===========================================================================

// ---------------------------------------------------------------------------
// Schema + Model (same as runtime E2E test)
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['user', 'admin']).default('user'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// Phantom type assertions
// ---------------------------------------------------------------------------

describe('E2E type safety: phantom types', () => {
  it('$response excludes hidden columns (passwordHash)', () => {
    type Response = (typeof usersTable)['$response'];
    const _r: Response = {} as Response;
    _r.email satisfies string;
    _r.name satisfies string;
    _r.role satisfies string;
    // @ts-expect-error — passwordHash is hidden, not in $response
    void _r.passwordHash;
  });

  it('$create_input excludes readOnly columns', () => {
    type CreateInput = (typeof usersTable)['$create_input'];
    const _c: CreateInput = {} as CreateInput;
    _c.email satisfies string;
    _c.name satisfies string;
    // @ts-expect-error — createdAt is readOnly, not in $create_input
    void _c.createdAt;
    // @ts-expect-error — updatedAt is readOnly, not in $create_input
    void _c.updatedAt;
    // @ts-expect-error — id is PK, not in $create_input
    void _c.id;
  });

  it('$update_input excludes readOnly columns', () => {
    type UpdateInput = (typeof usersTable)['$update_input'];
    const _u: UpdateInput = {} as UpdateInput;
    // @ts-expect-error — createdAt is readOnly, not in $update_input
    void _u.createdAt;
    // @ts-expect-error — id is PK, not in $update_input
    void _u.id;
  });

  it('$update_input fields are all optional', () => {
    type UpdateInput = (typeof usersTable)['$update_input'];
    // Empty object should be valid (all fields optional)
    const _valid: UpdateInput = {} as UpdateInput;
    void _valid;
  });
});

// ---------------------------------------------------------------------------
// Entity definition type safety
// ---------------------------------------------------------------------------

describe('E2E type safety: entity definition', () => {
  it('full entity definition compiles with all options', () => {
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
        create: (data, _ctx) => {
          // data is typed as $create_input
          data.email satisfies string;
          return data;
        },
        update: (data, _ctx) => {
          return data;
        },
      },
      after: {
        create: (result, _ctx) => {
          // result is typed as $response
          result.email satisfies string;
        },
        update: (_prev, _next, _ctx) => {},
        delete: (_row, _ctx) => {},
      },
    });
  });

  it('before.create data CAN have hidden fields (hidden = excluded from response, not input)', () => {
    entity('users', {
      model: usersModel,
      before: {
        create: (data, _ctx) => {
          // passwordHash is hidden but writable — hidden only affects API response, not input
          data.passwordHash satisfies string;
          return data;
        },
      },
    });
  });

  it('before.create data does NOT have readOnly fields', () => {
    entity('users', {
      model: usersModel,
      before: {
        create: (data, _ctx) => {
          // @ts-expect-error — createdAt is readOnly, not in create input
          void data.createdAt;
          return data;
        },
      },
    });
  });

  it('after.create result does NOT have hidden fields', () => {
    entity('users', {
      model: usersModel,
      after: {
        create: (result, _ctx) => {
          // @ts-expect-error — passwordHash is hidden, not in response
          void result.passwordHash;
        },
      },
    });
  });

  it('access rule rejects unknown operation names', () => {
    entity('users', {
      model: usersModel,
      access: {
        // @ts-expect-error — 'fly' is not a valid operation
        fly: () => true,
      },
    });
  });

  it('access rule rejects true as a value', () => {
    entity('users', {
      model: usersModel,
      access: {
        // @ts-expect-error — true is not a valid AccessRule
        list: true,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Model schemas type safety
// ---------------------------------------------------------------------------

describe('E2E type safety: model schemas', () => {
  it('response schema parse returns Result type without hidden columns', () => {
    const result = usersModel.schemas.response.parse({});
    if (!result.ok) throw result.error;
    result.data.email satisfies string;
    result.data.name satisfies string;
    // @ts-expect-error — passwordHash is hidden, not in $response
    void result.data.passwordHash;
  });

  it('createInput schema parse returns Result type without readOnly columns', () => {
    const result = usersModel.schemas.createInput.parse({});
    if (!result.ok) throw result.error;
    result.data.email satisfies string;
    // @ts-expect-error — createdAt is readOnly, not in $create_input
    void result.data.createdAt;
  });
});

// ---------------------------------------------------------------------------
// EntityOperations typed list — generic threading through pipeline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixture for typed list tests — model with relations
// ---------------------------------------------------------------------------

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  authorId: d.uuid(),
});

const usersModelWithRelations = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

describe('E2E type safety: EntityOperations list() accepts typed options', () => {
  type Ops = import('../entity-operations').EntityOperations<typeof usersModelWithRelations>;
  type ListOpts = Parameters<Ops['list']>[0];
  type WhereType = NonNullable<NonNullable<ListOpts>['where']>;
  type OrderByT = NonNullable<NonNullable<ListOpts>['orderBy']>;
  type IncludeT = NonNullable<NonNullable<ListOpts>['include']>;

  it('list() where clause validates column names', () => {
    // 'email' is a valid column
    type _t1 = { email: 'test@example.com' } extends WhereType ? true : false;
    void ({} as _t1 satisfies true);
  });

  it('list() where clause rejects invalid column names', () => {
    // @ts-expect-error — 'bogus' is not a column
    type _t1 = Expect<Extends<{ bogus: 'nope' }, WhereType>>;
  });

  it('list() orderBy validates column names', () => {
    type _t1 = { createdAt: 'desc' } extends OrderByT ? true : false;
    void ({} as _t1 satisfies true);
  });

  it('list() orderBy rejects invalid column names', () => {
    // @ts-expect-error — 'bogus' is not a column
    type _t1 = Expect<Extends<{ bogus: 'asc' }, OrderByT>>;
  });

  it('list() include validates relation names', () => {
    type _t1 = { posts: true } extends IncludeT ? true : false;
    void ({} as _t1 satisfies true);
  });

  it('list() include rejects invalid relation names', () => {
    // @ts-expect-error — 'bogus' is not a relation
    type _t1 = Expect<Extends<{ bogus: true }, IncludeT>>;
  });
});
