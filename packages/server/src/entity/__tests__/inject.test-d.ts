import { d } from '@vertz/db';
import { describe, expectTypeOf, it } from 'vitest';
import { entity } from '../entity';
import type { EntityContext } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable);

const productsTable = d.table('products', {
  id: d.uuid().primary(),
  title: d.text(),
  price: d.integer(),
});

const productsModel = d.model(productsTable);

const ordersTable = d.table('orders', {
  id: d.uuid().primary(),
  userId: d.uuid(),
  status: d.text(),
});

const ordersModel = d.model(ordersTable);

// Entity definitions for injection
const usersEntity = entity('users', { model: usersModel });
const productsEntity = entity('products', { model: productsModel });

// ---------------------------------------------------------------------------
// EntityContext with inject — type flow
// ---------------------------------------------------------------------------

describe('EntityContext inject type flow', () => {
  it('injected entity gives typed EntityOperations', () => {
    type Ctx = EntityContext<typeof ordersModel, { users: typeof usersEntity }>;
    type UsersOps = Ctx['entities']['users'];

    // get() returns the users $response type
    type GetReturn = Awaited<ReturnType<UsersOps['get']>>;
    expectTypeOf<GetReturn>().toHaveProperty('email');
    expectTypeOf<GetReturn>().toHaveProperty('name');
  });

  it('injected entity create() accepts typed input', () => {
    type Ctx = EntityContext<typeof ordersModel, { users: typeof usersEntity }>;
    type CreateParam = Parameters<Ctx['entities']['users']['create']>[0];

    // Should have email (required input field)
    expectTypeOf<CreateParam>().toHaveProperty('email');
    expectTypeOf<CreateParam>().toHaveProperty('name');
  });

  it('injected entity response excludes hidden fields', () => {
    type Ctx = EntityContext<typeof ordersModel, { users: typeof usersEntity }>;
    type GetReturn = Awaited<ReturnType<Ctx['entities']['users']['get']>>;

    // @ts-expect-error — passwordHash is hidden, excluded from $response
    type _Test = GetReturn['passwordHash'];
  });

  it('non-injected entity is compile error', () => {
    type Ctx = EntityContext<typeof ordersModel, { users: typeof usersEntity }>;

    // @ts-expect-error — products not in inject map
    type _Test = Ctx['entities']['products'];
  });

  it('typo in entity name is compile error', () => {
    type Ctx = EntityContext<typeof ordersModel, { users: typeof usersEntity }>;

    // @ts-expect-error — 'user' is not 'users'
    type _Test = Ctx['entities']['user'];
  });

  it('no inject = empty entities (no access)', () => {
    type Ctx = EntityContext<typeof ordersModel>;

    // @ts-expect-error — no entities available when no inject
    type _Test = Ctx['entities']['anything'];
  });

  it('self-access via ctx.entity is always typed regardless of inject', () => {
    type Ctx = EntityContext<typeof ordersModel, { users: typeof usersEntity }>;
    type GetReturn = Awaited<ReturnType<Ctx['entity']['get']>>;

    // Orders entity self-access
    expectTypeOf<GetReturn>().toHaveProperty('userId');
    expectTypeOf<GetReturn>().toHaveProperty('status');
  });

  it('multiple injected entities are all typed', () => {
    type Ctx = EntityContext<
      typeof ordersModel,
      { users: typeof usersEntity; products: typeof productsEntity }
    >;

    type UsersGetReturn = Awaited<ReturnType<Ctx['entities']['users']['get']>>;
    expectTypeOf<UsersGetReturn>().toHaveProperty('email');

    type ProductsGetReturn = Awaited<ReturnType<Ctx['entities']['products']['get']>>;
    expectTypeOf<ProductsGetReturn>().toHaveProperty('title');
    expectTypeOf<ProductsGetReturn>().toHaveProperty('price');
  });
});

// ---------------------------------------------------------------------------
// entity() config with inject — type flow
// ---------------------------------------------------------------------------

describe('entity() inject config types', () => {
  it('entity() accepts inject in config', () => {
    entity('orders', {
      model: ordersModel,
      inject: { users: usersEntity, products: productsEntity },
    });
  });

  it('EntityDefinition stores inject for graph introspection', () => {
    const orders = entity('orders', {
      model: ordersModel,
      inject: { users: usersEntity },
    });

    // inject should be accessible on the definition for dependency graph building
    expectTypeOf(orders.inject).toMatchTypeOf<Record<string, unknown>>();
  });

  it('inject map on definition contains the injected entity definitions', () => {
    const orders = entity('orders', {
      model: ordersModel,
      inject: { users: usersEntity, products: productsEntity },
    });

    // Both injected entities accessible on the frozen definition
    expectTypeOf(orders.inject).toHaveProperty('users');
    expectTypeOf(orders.inject).toHaveProperty('products');
  });
});
