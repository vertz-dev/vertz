/**
 * Type-level tests for typed CRUD function args (#2285).
 *
 * Verifies that GetArgs, ListArgs, CreateArgs, UpdateArgs, UpsertArgs,
 * DeleteArgs, CreateManyArgs, CreateManyAndReturnArgs, DeleteManyArgs,
 * and UpdateManyArgs are generic over TColumns and reject invalid input.
 */
import { d } from '../../d';
import type {
  CreateArgs,
  CreateManyAndReturnArgs,
  CreateManyArgs,
  DeleteArgs,
  DeleteManyArgs,
  GetArgs,
  ListArgs,
  UpdateArgs,
  UpdateManyArgs,
  UpsertArgs,
} from '../crud';
import type { FilterType, InsertInput, SelectOption } from '../../schema/inference';

const usersTable = d.table('users', {
  id: d.uuid().primary().default('gen_random_uuid()'),
  name: d.text(),
  email: d.text(),
  age: d.integer().nullable(),
  active: d.boolean().default(true),
});

type UserColumns = typeof usersTable._columns;

// ---------------------------------------------------------------------------
// GetArgs — positive
// ---------------------------------------------------------------------------

const validGet: GetArgs<UserColumns> = {
  where: { name: 'Alice' },
  select: { name: true, email: true },
  orderBy: { name: 'asc' },
};
void validGet;

// GetArgs — negative: non-existent column in where
const badGetWhere: GetArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  where: { nonExistent: 'value' },
};
void badGetWhere;

// GetArgs — negative: non-existent column in select
const badGetSelect: GetArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  select: { nonExistent: true },
};
void badGetSelect;

// GetArgs — negative: invalid orderBy value
const badGetOrder: GetArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  orderBy: { nonExistent: 'asc' },
};
void badGetOrder;

// ---------------------------------------------------------------------------
// ListArgs — positive
// ---------------------------------------------------------------------------

const validList: ListArgs<UserColumns> = {
  where: { active: true },
  select: { id: true, name: true },
  orderBy: { name: 'desc' },
  limit: 10,
  offset: 0,
};
void validList;

// ListArgs — negative: non-existent column in where
const badList: ListArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  where: { nonExistent: 'value' },
};
void badList;

// ListArgs — negative: non-existent column in select
const badListSelect: ListArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  select: { nonExistent: true },
};
void badListSelect;

// ListArgs — negative: non-existent column in orderBy
const badListOrder: ListArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  orderBy: { nonExistent: 'asc' },
};
void badListOrder;

// ---------------------------------------------------------------------------
// CreateArgs — positive
// ---------------------------------------------------------------------------

const validCreate: CreateArgs<UserColumns> = {
  data: { name: 'Bob', email: 'bob@example.com', age: null },
  select: { id: true },
};
void validCreate;

// CreateArgs — negative: missing required field
const badCreate: CreateArgs<UserColumns> = {
  // @ts-expect-error — 'email' is required (no default)
  data: { name: 'Bob', age: null },
};
void badCreate;

// ---------------------------------------------------------------------------
// CreateManyArgs — positive
// ---------------------------------------------------------------------------

const validCreateMany: CreateManyArgs<UserColumns> = {
  data: [
    { name: 'Alice', email: 'alice@example.com', age: null },
    { name: 'Bob', email: 'bob@example.com', age: 30 },
  ],
};
void validCreateMany;

// CreateManyArgs — negative: missing required field
const badCreateMany: CreateManyArgs<UserColumns> = {
  // @ts-expect-error — 'email' is required
  data: [{ name: 'Alice', age: null }],
};
void badCreateMany;

// ---------------------------------------------------------------------------
// CreateManyAndReturnArgs — positive
// ---------------------------------------------------------------------------

const validCreateManyReturn: CreateManyAndReturnArgs<UserColumns> = {
  data: [{ name: 'Alice', email: 'alice@example.com', age: null }],
  select: { id: true, name: true },
};
void validCreateManyReturn;

// CreateManyAndReturnArgs — negative: missing required field
const badCreateManyReturn: CreateManyAndReturnArgs<UserColumns> = {
  // @ts-expect-error — 'email' is required
  data: [{ name: 'Alice', age: null }],
};
void badCreateManyReturn;

// CreateManyAndReturnArgs — negative: non-existent column in select
const badCreateManyReturnSelect: CreateManyAndReturnArgs<UserColumns> = {
  data: [{ name: 'Alice', email: 'alice@example.com', age: null }],
  // @ts-expect-error — 'nonExistent' is not a column
  select: { nonExistent: true },
};
void badCreateManyReturnSelect;

// ---------------------------------------------------------------------------
// UpdateArgs — positive
// ---------------------------------------------------------------------------

const validUpdate: UpdateArgs<UserColumns> = {
  where: { id: '123' },
  data: { name: 'Updated' },
  select: { id: true, name: true },
};
void validUpdate;

// UpdateArgs — negative: primary key in data
const badUpdate: UpdateArgs<UserColumns> = {
  where: { id: '123' },
  // @ts-expect-error — 'id' is primary, cannot be updated
  data: { id: 'new-id' },
};
void badUpdate;

// UpdateArgs — negative: non-existent column in where
const badUpdateWhere: UpdateArgs<UserColumns> = {
  // @ts-expect-error — 'nonExistent' is not a column
  where: { nonExistent: 'value' },
  data: { name: 'x' },
};
void badUpdateWhere;

// ---------------------------------------------------------------------------
// UpdateManyArgs — positive
// ---------------------------------------------------------------------------

const validUpdateMany: UpdateManyArgs<UserColumns> = {
  where: { active: false },
  data: { active: true },
};
void validUpdateMany;

// UpdateManyArgs — negative: non-existent column
const badUpdateMany: UpdateManyArgs<UserColumns> = {
  // @ts-expect-error — 'foo' is not a column
  where: { foo: 'bar' },
  data: { name: 'x' },
};
void badUpdateMany;

// ---------------------------------------------------------------------------
// UpsertArgs — positive
// ---------------------------------------------------------------------------

const validUpsert: UpsertArgs<UserColumns> = {
  where: { email: 'a@b.com' },
  create: { name: 'Alice', email: 'a@b.com', age: null },
  update: { name: 'Alice Updated' },
  select: { id: true },
};
void validUpsert;

// UpsertArgs — negative: missing required in create
const badUpsertCreate: UpsertArgs<UserColumns> = {
  where: { email: 'a@b.com' },
  // @ts-expect-error — 'email' is required in create
  create: { name: 'Alice', age: null },
  update: { name: 'Updated' },
};
void badUpsertCreate;

// UpsertArgs — negative: primary key in update
const badUpsertUpdate: UpsertArgs<UserColumns> = {
  where: { email: 'a@b.com' },
  create: { name: 'Alice', email: 'a@b.com', age: null },
  // @ts-expect-error — 'id' is primary, cannot be updated
  update: { id: 'new-id' },
};
void badUpsertUpdate;

// ---------------------------------------------------------------------------
// DeleteArgs — positive
// ---------------------------------------------------------------------------

const validDelete: DeleteArgs<UserColumns> = {
  where: { id: '123' },
  select: { id: true },
};
void validDelete;

// DeleteArgs — negative: non-existent column
const badDelete: DeleteArgs<UserColumns> = {
  // @ts-expect-error — 'foo' is not a column
  where: { foo: 'bar' },
};
void badDelete;

// ---------------------------------------------------------------------------
// DeleteManyArgs — positive
// ---------------------------------------------------------------------------

const validDeleteMany: DeleteManyArgs<UserColumns> = {
  where: { active: false },
};
void validDeleteMany;

// DeleteManyArgs — negative: non-existent column
const badDeleteMany: DeleteManyArgs<UserColumns> = {
  // @ts-expect-error — 'foo' is not a column
  where: { foo: 'bar' },
};
void badDeleteMany;

// ---------------------------------------------------------------------------
// Backward compatibility — unparameterized args accept anything
// ---------------------------------------------------------------------------

const looseGet: GetArgs = {
  where: { anything: 'goes' },
  select: { whatever: true },
  orderBy: { random: 'asc' },
};
void looseGet;

const looseCreate: CreateArgs = {
  data: { anything: 'goes' },
};
void looseCreate;

const looseUpdate: UpdateArgs = {
  where: { any: 'thing' },
  data: { foo: 'bar' },
};
void looseUpdate;

const looseDelete: DeleteArgs = {
  where: { any: 'thing' },
};
void looseDelete;

// ---------------------------------------------------------------------------
// Assignability — typed args assignable to Record<string, unknown>
// ---------------------------------------------------------------------------

const _filterCompat: Record<string, unknown> = {} as FilterType<UserColumns>;
void _filterCompat;

const _insertCompat: Record<string, unknown> = {} as InsertInput<typeof usersTable>;
void _insertCompat;

const _selectCompat: Record<string, unknown> = {} as SelectOption<UserColumns>;
void _selectCompat;
