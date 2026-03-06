import { d } from '@vertz/db';
import { describe, it } from 'bun:test';
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
    const _check: BaseContext = {} as Ctx;
    void _check;
  });

  it('ActionContext.entities has typed injected entity', () => {
    type Ctx = ActionContext<{ users: typeof usersEntity }>;
    type UsersOps = Ctx['entities']['users'];
    type GetReturn = Awaited<ReturnType<UsersOps['get']>>;

    const _check1: GetReturn['email'] = {} as GetReturn['email'];
    void _check1;
    const _check2: GetReturn['name'] = {} as GetReturn['name'];
    void _check2;
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
    const _check1: UsersGet['email'] = {} as UsersGet['email'];
    void _check1;

    type ProductsGet = Awaited<ReturnType<Ctx['entities']['products']['get']>>;
    const _check2: ProductsGet['title'] = {} as ProductsGet['title'];
    void _check2;
    const _check3: ProductsGet['price'] = {} as ProductsGet['price'];
    void _check3;
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

    const _check1: 'action' = def.kind;
    const _check1r: typeof def.kind = 'action' as const;
    void _check1; void _check1r;
    const _check2: string = def.name;
    void _check2;
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

    const _check: Record<string, unknown> = def.inject;
    void _check;
  });
});
