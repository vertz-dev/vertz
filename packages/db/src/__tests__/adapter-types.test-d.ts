/**
 * Type-level tests for EntityDbAdapter<TEntry> generic threading.
 *
 * Verifies that EntityDbAdapter parameterized with a ModelEntry
 * provides fully typed CRUD operations — inputs, outputs, and query options.
 */
import { describe, it } from 'bun:test';
import { d } from '../d';
import type { ModelEntry } from '../schema/inference';
import type { EntityDbAdapter, ListOptions } from '../types/adapter';
import type { Equal, Expect, Extends, HasKey, Not } from './_type-helpers';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const commentTable = d.table('comment', {
  id: d.text().primary(),
  body: d.text(),
  taskId: d.text(),
  createdAt: d.timestamp().default('now'),
});

const taskTable = d.table('task', {
  id: d.text().primary(),
  title: d.text(),
  status: d.text(),
  tenantId: d.text(),
  createdAt: d.timestamp().readOnly().default('now'),
});

const commentsRelation = d.ref.many(() => commentTable, 'taskId');

type TaskEntry = ModelEntry<typeof taskTable, { comments: typeof commentsRelation }>;
type TaskAdapter = EntityDbAdapter<TaskEntry>;

// ---------------------------------------------------------------------------
// Phase 1: EntityDbAdapter<TEntry> — typed outputs
// ---------------------------------------------------------------------------

describe('EntityDbAdapter<TEntry> typed outputs', () => {
  it('get() returns $response | null', () => {
    type Result = Awaited<ReturnType<TaskAdapter['get']>>;
    type _t1 = Expect<Equal<Result, (typeof taskTable)['$response'] | null>>;
  });

  it('list() returns { data: $response[]; total: number }', () => {
    type Result = Awaited<ReturnType<TaskAdapter['list']>>;
    type _t1 = Expect<Equal<Result, { data: (typeof taskTable)['$response'][]; total: number }>>;
  });

  it('create() returns $response', () => {
    type Result = Awaited<ReturnType<TaskAdapter['create']>>;
    type _t1 = Expect<Equal<Result, (typeof taskTable)['$response']>>;
  });

  it('update() returns $response', () => {
    type Result = Awaited<ReturnType<TaskAdapter['update']>>;
    type _t1 = Expect<Equal<Result, (typeof taskTable)['$response']>>;
  });

  it('delete() returns $response | null', () => {
    type Result = Awaited<ReturnType<TaskAdapter['delete']>>;
    type _t1 = Expect<Equal<Result, (typeof taskTable)['$response'] | null>>;
  });
});

// ---------------------------------------------------------------------------
// Phase 1: Typed query options — where, orderBy, include
// ---------------------------------------------------------------------------

describe('EntityDbAdapter<TEntry> typed query options', () => {
  it('list() where type is FilterType — accepts valid column names', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type WhereType = NonNullable<NonNullable<ListOpts>['where']>;
    // 'status' is a valid column
    type _t1 = Expect<Extends<{ status: 'active' }, WhereType>>;
    // Operator form
    type _t2 = Expect<Extends<{ status: { contains: 'act' } }, WhereType>>;
    type _t3 = Expect<Extends<{ title: { startsWith: 'T' } }, WhereType>>;
  });

  it('list() orderBy type is OrderByType — accepts valid column names', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type OrderByT = NonNullable<NonNullable<ListOpts>['orderBy']>;
    type _t1 = Expect<Extends<{ createdAt: 'desc' }, OrderByT>>;
    type _t2 = Expect<Extends<{ title: 'asc' }, OrderByT>>;
  });

  it('list() include type is IncludeOption — accepts valid relation names', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type IncludeT = NonNullable<NonNullable<ListOpts>['include']>;
    type _t1 = Expect<Extends<{ comments: true }, IncludeT>>;
  });

  it('list() include with typed sub-query', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type IncludeT = NonNullable<NonNullable<ListOpts>['include']>;
    type _t1 = Expect<
      Extends<
        {
          comments: {
            where: { body: { contains: 'hello' } };
            orderBy: { createdAt: 'asc' };
            limit: 10;
          };
        },
        IncludeT
      >
    >;
  });

  it('get() include type is IncludeOption — accepts valid relation names', () => {
    type GetOpts = Parameters<TaskAdapter['get']>[1];
    type IncludeT = NonNullable<NonNullable<GetOpts>['include']>;
    type _t1 = Expect<Extends<{ comments: true }, IncludeT>>;
  });
});

// ---------------------------------------------------------------------------
// Phase 1: Typed inputs
// ---------------------------------------------------------------------------

describe('EntityDbAdapter<TEntry> typed inputs', () => {
  it('create() accepts $create_input', () => {
    type CreateInput = Parameters<TaskAdapter['create']>[0];
    type _t1 = Expect<Equal<CreateInput, (typeof taskTable)['$create_input']>>;
  });

  it('update() accepts $update_input', () => {
    type UpdateInput = Parameters<TaskAdapter['update']>[1];
    type _t1 = Expect<Equal<UpdateInput, (typeof taskTable)['$update_input']>>;
  });
});

// ---------------------------------------------------------------------------
// Phase 1: Negative tests — invalid usage rejected
// ---------------------------------------------------------------------------

describe('EntityDbAdapter<TEntry> rejects invalid usage', () => {
  it('list() where rejects invalid column names', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type WhereType = NonNullable<NonNullable<ListOpts>['where']>;
    // @ts-expect-error — 'bogus' is not a column on TaskEntry
    type _t1 = Expect<Extends<{ bogus: 'nope' }, WhereType>>;
  });

  it('list() orderBy rejects invalid column names', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type OrderByT = NonNullable<NonNullable<ListOpts>['orderBy']>;
    // @ts-expect-error — 'bogus' is not a column for orderBy
    type _t1 = Expect<Extends<{ bogus: 'asc' }, OrderByT>>;
  });

  it('list() include rejects invalid relation names', () => {
    type ListOpts = Parameters<TaskAdapter['list']>[0];
    type IncludeT = NonNullable<NonNullable<ListOpts>['include']>;
    // @ts-expect-error — 'bogus' is not a relation
    type _t1 = Expect<Extends<{ bogus: true }, IncludeT>>;
  });

  it('get() include rejects invalid relation names', () => {
    type GetOpts = Parameters<TaskAdapter['get']>[1];
    type IncludeT = NonNullable<NonNullable<GetOpts>['include']>;
    // @ts-expect-error — 'bogus' is not a relation
    type _t1 = Expect<Extends<{ bogus: true }, IncludeT>>;
  });

  it('create() rejects invalid field names', () => {
    type CreateInput = Parameters<TaskAdapter['create']>[0];
    // 'bogus' is not a valid create field
    type _t1 = Expect<Not<HasKey<CreateInput, 'bogus'>>>;
  });

  it('update() rejects invalid field names', () => {
    type UpdateInput = Parameters<TaskAdapter['update']>[1];
    // 'bogus' is not a valid update field
    type _t1 = Expect<Not<HasKey<UpdateInput, 'bogus'>>>;
  });

  it('create() rejects wrong field types', () => {
    type CreateInput = Parameters<TaskAdapter['create']>[0];
    // @ts-expect-error — status expects string, not number
    type _t1 = Expect<Extends<{ title: 'test'; status: 123; tenantId: 't1' }, CreateInput>>;
  });
});

// ---------------------------------------------------------------------------
// Phase 1: Backward compatibility
// ---------------------------------------------------------------------------

describe('EntityDbAdapter backward compatibility', () => {
  it('unparameterized EntityDbAdapter result is assignable to Record<string, unknown>', () => {
    type Result = Awaited<ReturnType<EntityDbAdapter['get']>>;
    type _t1 = Expect<Extends<NonNullable<Result>, Record<string, unknown>>>;
  });

  it('unparameterized ListOptions accepts any where keys', () => {
    type WhereType = NonNullable<ListOptions['where']>;
    type _t1 = Expect<Extends<{ anything: 'goes' }, WhereType>>;
  });
});
