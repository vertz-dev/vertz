import { describe, expectTypeOf, it } from 'bun:test';
import { d } from '@vertz/db';
import { content } from '../../content';
import { entity } from '../../entity/entity';
import type { BaseContext } from '../../entity/types';
import { service } from '../service';
import type { ServiceContext } from '../types';

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
// ServiceContext type flow
// ---------------------------------------------------------------------------

describe('ServiceContext type flow', () => {
  it('ServiceContext extends BaseContext', () => {
    type Ctx = ServiceContext<{ users: typeof usersEntity }>;
    const _check: BaseContext = {} as Ctx;
    void _check;
  });

  it('ServiceContext.entities has typed injected entity', () => {
    type Ctx = ServiceContext<{ users: typeof usersEntity }>;
    type UsersOps = Ctx['entities']['users'];
    type GetReturn = Awaited<ReturnType<UsersOps['get']>>;

    const _check1: GetReturn['email'] = {} as GetReturn['email'];
    void _check1;
    const _check2: GetReturn['name'] = {} as GetReturn['name'];
    void _check2;
  });

  it('ServiceContext.entities rejects non-injected entity', () => {
    type Ctx = ServiceContext<{ users: typeof usersEntity }>;

    // @ts-expect-error — products not in inject map
    type _Test = Ctx['entities']['products'];
  });

  it('ServiceContext has NO entity property (no self-CRUD)', () => {
    type Ctx = ServiceContext<{ users: typeof usersEntity }>;

    // @ts-expect-error — services don't have self-CRUD
    type _Test = Ctx['entity'];
  });

  it('ServiceContext with multiple injected entities are all typed', () => {
    type Ctx = ServiceContext<{
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
// service() definition type flow
// ---------------------------------------------------------------------------

describe('service() definition type flow', () => {
  it('service() returns ServiceDefinition with kind "service"', () => {
    const def = service('auth', {
      actions: {
        login: {
          body: bodySchema,
          response: responseSchema,
          handler: async () => ({ token: 'tok' }),
        },
      },
    });

    const _check1: 'service' = def.kind;
    const _check1r: typeof def.kind = 'service' as const;
    void _check1;
    void _check1r;
    const _check2: string = def.name;
    void _check2;
  });

  it('service() with inject stores the inject map', () => {
    const def = service('auth', {
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

// ---------------------------------------------------------------------------
// ServiceDefinition phantom type — TActions preservation (#1779)
// ---------------------------------------------------------------------------

describe('ServiceDefinition phantom TActions preservation', () => {
  it('service() return type carries action types via __actions phantom', () => {
    const def = service('auth', {
      actions: {
        login: {
          body: bodySchema,
          response: responseSchema,
          handler: async (input) => ({ token: `tok-${input.email}` }),
        },
      },
    });

    // The phantom __actions should carry the concrete action types
    type Actions = NonNullable<(typeof def)['__actions']>;
    type LoginAction = Actions['login'];

    // Input type should be { email: string } (from bodySchema)
    type LoginInput = LoginAction extends {
      handler: (input: infer I, ...args: unknown[]) => unknown;
    }
      ? I
      : never;
    const _check: { email: string } = {} as LoginInput;
    void _check;
  });

  it('typed ServiceDefinitions are assignable to ServiceDefinition[] (array compat)', () => {
    const authDef = service('auth', {
      actions: {
        login: {
          body: bodySchema,
          response: responseSchema,
          handler: async () => ({ token: 'tok' }),
        },
      },
    });

    const healthDef = service('health', {
      actions: {
        check: {
          response: responseSchema,
          handler: async () => ({ token: 'ok' }),
        },
      },
    });

    // Both should be assignable to ServiceDefinition[] without type errors
    const _arr: import('../types').ServiceDefinition[] = [authDef, healthDef];
    void _arr;
  });
});

// ---------------------------------------------------------------------------
// Content descriptor type flow
// ---------------------------------------------------------------------------

describe('Content descriptor type flow', () => {
  it('handler input is string when body is content.xml()', () => {
    service('test', {
      actions: {
        xmlAction: {
          method: 'POST',
          body: content.xml(),
          response: content.xml(),
          handler: async (input) => {
            expectTypeOf(input).toEqualTypeOf<string>();
            return input.toUpperCase();
          },
        },
      },
    });
  });

  it('handler output is string when response is content.html()', () => {
    service('test', {
      actions: {
        htmlAction: {
          method: 'GET',
          response: content.html(),
          handler: async (_input) => {
            return '<html></html>';
          },
        },
      },
    });
  });

  it('handler compiles with no body (GET request)', () => {
    service('test', {
      actions: {
        getAction: {
          method: 'GET',
          response: content.text(),
          handler: async () => 'OK',
        },
      },
    });
  });

  it('existing JSON actions are unchanged', () => {
    service('test', {
      actions: {
        jsonAction: {
          method: 'POST',
          body: bodySchema,
          response: responseSchema,
          handler: async (input) => {
            expectTypeOf(input).toEqualTypeOf<{ email: string }>();
            return { token: 'tok' };
          },
        },
      },
    });
  });
});
