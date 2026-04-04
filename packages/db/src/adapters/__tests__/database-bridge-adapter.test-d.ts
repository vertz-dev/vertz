/**
 * Type-level tests for createDatabaseBridgeAdapter.
 *
 * Verifies that the bridge adapter correctly threads generic types from
 * DatabaseClient through to EntityDbAdapter — typed inputs, typed outputs.
 */
import { describe, it } from 'bun:test';
import type { Equal, Expect, Extends } from '../../__tests__/_type-helpers';
import type { DatabaseClient } from '../../client/database';
import { d } from '../../d';
import type { EntityDbAdapter } from '../../types/adapter';
import { createDatabaseBridgeAdapter } from '../database-bridge-adapter';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.text(),
  createdAt: d.timestamp().readOnly().default('now'),
});

const models = { users: d.model(usersTable) };

type UserEntry = (typeof models)['users'];
type UserResponse = (typeof usersTable)['$response'];
type UserCreateInput = (typeof usersTable)['$create_input'];
type UserUpdateInput = (typeof usersTable)['$update_input'];

declare const db: DatabaseClient<typeof models>;

// ---------------------------------------------------------------------------
// Bridge adapter returns correctly typed EntityDbAdapter
// ---------------------------------------------------------------------------

describe('createDatabaseBridgeAdapter type threading', () => {
  it('returns EntityDbAdapter parameterized with the correct model entry', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    type _t1 = Expect<Extends<typeof adapter, EntityDbAdapter<UserEntry>>>;
  });

  it('get() returns typed response or null', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    type Result = Awaited<ReturnType<typeof adapter.get>>;
    type _t1 = Expect<Equal<Result, UserResponse | null>>;
  });

  it('list() returns typed array with total', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    type Result = Awaited<ReturnType<typeof adapter.list>>;
    type _t1 = Expect<Equal<Result, { data: UserResponse[]; total: number }>>;
  });

  it('create() accepts typed create input and returns typed response', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    type Input = Parameters<typeof adapter.create>[0];
    type Result = Awaited<ReturnType<typeof adapter.create>>;
    type _t1 = Expect<Equal<Input, UserCreateInput>>;
    type _t2 = Expect<Equal<Result, UserResponse>>;
  });

  it('update() accepts typed update input and returns typed response', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    type Input = Parameters<typeof adapter.update>[1];
    type Result = Awaited<ReturnType<typeof adapter.update>>;
    type _t1 = Expect<Equal<Input, UserUpdateInput>>;
    type _t2 = Expect<Equal<Result, UserResponse>>;
  });

  it('delete() returns typed response or null', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    type Result = Awaited<ReturnType<typeof adapter.delete>>;
    type _t1 = Expect<Equal<Result, UserResponse | null>>;
  });
});

// ---------------------------------------------------------------------------
// Negative tests — invalid usage rejected
// ---------------------------------------------------------------------------

describe('GetOptions accepts optional where', () => {
  it('compiles with get(id) — backward compatible', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.get('u1');
  });

  it('compiles with get(id, { where }) — new usage', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.get('u1', { where: { name: 'Alice' } });
  });

  it('compiles with get(id, { include, where }) — combined', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.get('u1', { include: { posts: true }, where: { email: 'a@b.com' } });
  });
});

describe('update() accepts optional UpdateOptions', () => {
  it('compiles with update(id, data) — backward compatible', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.update('u1', { name: 'Updated' });
  });

  it('compiles with update(id, data, { where }) — new usage', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.update('u1', { name: 'Updated' }, { where: { email: 'a@b.com' } });
  });
});

describe('delete() accepts optional DeleteOptions', () => {
  it('compiles with delete(id) — backward compatible', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.delete('u1');
  });

  it('compiles with delete(id, { where }) — new usage', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.delete('u1', { where: { name: 'Alice' } });
  });
});

// ---------------------------------------------------------------------------
// Composite ID — Record<string, string> accepted
// ---------------------------------------------------------------------------

describe('EntityDbAdapter accepts composite ID (Record<string, string>)', () => {
  it('get() accepts Record<string, string>', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.get({ projectId: 'p1', userId: 'u1' });
  });

  it('update() accepts Record<string, string>', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.update({ projectId: 'p1', userId: 'u1' }, { name: 'Updated' });
  });

  it('delete() accepts Record<string, string>', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.delete({ projectId: 'p1', userId: 'u1' });
  });

  it('get() still accepts string (backward compat)', () => {
    const adapter = createDatabaseBridgeAdapter(db, 'users');
    adapter.get('uuid-123');
  });
});

describe('createDatabaseBridgeAdapter rejects invalid usage', () => {
  it('rejects a table name not in the models registry', () => {
    // @ts-expect-error — 'posts' is not a registered model
    createDatabaseBridgeAdapter(db, 'posts');
  });
});
