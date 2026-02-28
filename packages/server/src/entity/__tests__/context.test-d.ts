import { d } from '@vertz/db';
import { describe, expectTypeOf, it } from 'vitest';
import { createEntityContext } from '../context';
import type { EntityOperations } from '../entity-operations';
import type { EntityContext } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const usersModel = d.model(usersTable);

type UsersModel = typeof usersModel;

// ---------------------------------------------------------------------------
// EntityContext type flow — entity operations are typed from model
// ---------------------------------------------------------------------------

describe('EntityContext type flow', () => {
  it('ctx.entity.create() accepts $create_input typed data', () => {
    type CreateParam = Parameters<EntityContext<UsersModel>['entity']['create']>[0];

    // email and name should be present (required input fields)
    expectTypeOf<CreateParam>().toHaveProperty('email');
    expectTypeOf<CreateParam>().toHaveProperty('name');
  });

  it('ctx.entity.create() data excludes readOnly columns', () => {
    type CreateParam = Parameters<EntityContext<UsersModel>['entity']['create']>[0];

    // @ts-expect-error — createdAt is readOnly, excluded from $create_input
    type _Test = CreateParam['createdAt'];
  });

  it('ctx.entity.create() data excludes primary key', () => {
    type CreateParam = Parameters<EntityContext<UsersModel>['entity']['create']>[0];

    // @ts-expect-error — id is PK, excluded from $create_input
    type _Test = CreateParam['id'];
  });

  it('ctx.entity.get() returns $response typed data', () => {
    type GetReturn = Awaited<ReturnType<EntityContext<UsersModel>['entity']['get']>>;

    // email and name should be present in response
    expectTypeOf<GetReturn>().toHaveProperty('email');
    expectTypeOf<GetReturn>().toHaveProperty('name');
  });

  it('ctx.entity.get() response excludes hidden columns', () => {
    type GetReturn = Awaited<ReturnType<EntityContext<UsersModel>['entity']['get']>>;

    // @ts-expect-error — passwordHash is hidden, excluded from $response
    type _Test = GetReturn['passwordHash'];
  });

  it('ctx.entity.update() accepts $update_input typed data', () => {
    type UpdateParam = Parameters<EntityContext<UsersModel>['entity']['update']>[1];

    // All fields should be optional (partial update)
    expectTypeOf<UpdateParam>().toMatchTypeOf<{ email?: string }>();
  });

  it('ctx.entity.update() data excludes readOnly columns', () => {
    type UpdateParam = Parameters<EntityContext<UsersModel>['entity']['update']>[1];

    // @ts-expect-error — createdAt is readOnly, excluded from $update_input
    type _Test = UpdateParam['createdAt'];
  });

  it('ctx.entities is empty when no inject is provided', () => {
    type EntitiesType = EntityContext<UsersModel>['entities'];

    // @ts-expect-error — no entities available without inject
    type _Test = EntitiesType['anyEntity'];
  });

  it('ctx with default ModelDef compiles (for access rules)', () => {
    // EntityContext without generic arg should compile
    type Ctx = EntityContext;
    expectTypeOf<Ctx['userId']>().toEqualTypeOf<string | null>();
  });

  it('createEntityContext() return type preserves TModel generic', () => {
    // Verify the factory function threads TModel through to the return type
    const ctx = createEntityContext(
      { userId: 'user-1' },
      {} as EntityOperations<UsersModel>,
      {},
    );

    // ctx.entity should be typed with UsersModel
    type CreateParam = Parameters<typeof ctx.entity.create>[0];

    // email should be present
    expectTypeOf<CreateParam>().toHaveProperty('email');

    // @ts-expect-error — createdAt is readOnly, excluded from $create_input
    type _Test = CreateParam['createdAt'];
  });
});
