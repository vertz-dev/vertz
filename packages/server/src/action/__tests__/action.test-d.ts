import { d } from '@vertz/db';
import { describe, expectTypeOf, it } from 'vitest';
import { entity } from '../../entity/entity';
import type { BaseContext } from '../../entity/types';
import { action } from '../action';
import type { ActionContext } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable);

const productsTable = d.table('products', {
  id: d.uuid().primary(),
  title: d.text(),
  price: d.integer(),
});

const productsModel = d.model(productsTable);

const usersEntity = entity('users', { model: usersModel });
const productsEntity = entity('products', { model: productsModel });

const bodySchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { email: string } }),
};
const responseSchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { token: string } }),
};

// ---------------------------------------------------------------------------
// ActionContext type flow
// ---------------------------------------------------------------------------

describe('ActionContext type flow', () => {
  it('ActionContext extends BaseContext', () => {
    type Ctx = ActionContext<{ users: typeof usersEntity }>;
    expectTypeOf<Ctx>().toMatchTypeOf<BaseContext>();
  });

  it('ActionContext.entities has typed injected entity', () => {
    type Ctx = ActionContext<{ users: typeof usersEntity }>;
    type UsersOps = Ctx['entities']['users'];
    type GetReturn = Awaited<ReturnType<UsersOps['get']>>;

    expectTypeOf<GetReturn>().toHaveProperty('email');
    expectTypeOf<GetReturn>().toHaveProperty('name');
  });

  it('ActionContext.entities rejects non-injected entity', () => {
    type Ctx = ActionContext<{ users: typeof usersEntity }>;

    // @ts-expect-error — products not in inject map
    type _Test = Ctx['entities']['products'];
  });

  it('ActionContext has NO entity property (no self-CRUD)', () => {
    type Ctx = ActionContext<{ users: typeof usersEntity }>;

    // @ts-expect-error — actions don't have self-CRUD
    type _Test = Ctx['entity'];
  });

  it('ActionContext with multiple injected entities are all typed', () => {
    type Ctx = ActionContext<{
      users: typeof usersEntity;
      products: typeof productsEntity;
    }>;

    type UsersGet = Awaited<ReturnType<Ctx['entities']['users']['get']>>;
    expectTypeOf<UsersGet>().toHaveProperty('email');

    type ProductsGet = Awaited<ReturnType<Ctx['entities']['products']['get']>>;
    expectTypeOf<ProductsGet>().toHaveProperty('title');
    expectTypeOf<ProductsGet>().toHaveProperty('price');
  });
});

// ---------------------------------------------------------------------------
// action() definition type flow
// ---------------------------------------------------------------------------

describe('action() definition type flow', () => {
  it('action() returns ActionDefinition with kind "action"', () => {
    const def = action('auth', {
      actions: {
        login: {
          body: bodySchema,
          response: responseSchema,
          handler: async () => ({ token: 'tok' }),
        },
      },
    });

    expectTypeOf(def.kind).toEqualTypeOf<'action'>();
    expectTypeOf(def.name).toBeString();
  });

  it('action() with inject stores the inject map', () => {
    const def = action('auth', {
      inject: { users: usersEntity },
      actions: {
        login: {
          body: bodySchema,
          response: responseSchema,
          handler: async () => ({ token: 'tok' }),
        },
      },
    });

    expectTypeOf(def.inject).toMatchTypeOf<Record<string, unknown>>();
  });
});
