import { describe, it } from 'bun:test';
import type { Expect, Extends, HasKey, Not, Unwrap } from '../../__tests__/_type-helpers';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Fixture: table with hidden, readOnly, autoUpdate, and default columns
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const usersModel = d.model(users);

// ---------------------------------------------------------------------------
// schemas.response — type excludes hidden columns
// ---------------------------------------------------------------------------

describe('ModelDef schemas.response type', () => {
  it('excludes hidden columns from the parsed result', () => {
    type ResponseType = Unwrap<ReturnType<typeof usersModel.schemas.response.parse>>;

    // passwordHash is .is('hidden') — should NOT appear
    type _t1 = Expect<Not<HasKey<ResponseType, 'passwordHash'>>>;
  });

  it('includes non-hidden columns', () => {
    type ResponseType = Unwrap<ReturnType<typeof usersModel.schemas.response.parse>>;

    type _t1 = Expect<HasKey<ResponseType, 'id'>>;
    type _t2 = Expect<HasKey<ResponseType, 'email'>>;
    type _t3 = Expect<HasKey<ResponseType, 'name'>>;
  });
});

// ---------------------------------------------------------------------------
// schemas.createInput — type excludes readOnly and PK columns
// ---------------------------------------------------------------------------

describe('ModelDef schemas.createInput type', () => {
  it('excludes readOnly columns from the parsed result', () => {
    type CreateType = Unwrap<ReturnType<typeof usersModel.schemas.createInput.parse>>;

    // createdAt is .readOnly() — should NOT appear
    type _t1 = Expect<Not<HasKey<CreateType, 'createdAt'>>>;
    // updatedAt is .autoUpdate() (implies readOnly) — should NOT appear
    type _t2 = Expect<Not<HasKey<CreateType, 'updatedAt'>>>;
  });

  it('excludes primary key columns', () => {
    type CreateType = Unwrap<ReturnType<typeof usersModel.schemas.createInput.parse>>;

    type _t1 = Expect<Not<HasKey<CreateType, 'id'>>>;
  });

  it('includes non-readOnly, non-PK columns', () => {
    type CreateType = Unwrap<ReturnType<typeof usersModel.schemas.createInput.parse>>;

    type _t1 = Expect<HasKey<CreateType, 'email'>>;
    type _t2 = Expect<HasKey<CreateType, 'name'>>;
    // hidden but non-readOnly — included in createInput
    type _t3 = Expect<HasKey<CreateType, 'passwordHash'>>;
  });
});

// ---------------------------------------------------------------------------
// schemas.updateInput — type excludes readOnly + PK, all optional
// ---------------------------------------------------------------------------

describe('ModelDef schemas.updateInput type', () => {
  it('excludes readOnly columns', () => {
    type UpdateType = Unwrap<ReturnType<typeof usersModel.schemas.updateInput.parse>>;

    type _t1 = Expect<Not<HasKey<UpdateType, 'createdAt'>>>;
    type _t2 = Expect<Not<HasKey<UpdateType, 'updatedAt'>>>;
  });

  it('excludes primary key columns', () => {
    type UpdateType = Unwrap<ReturnType<typeof usersModel.schemas.updateInput.parse>>;

    type _t1 = Expect<Not<HasKey<UpdateType, 'id'>>>;
  });

  it('makes all remaining fields optional (empty object is valid)', () => {
    type UpdateType = Unwrap<ReturnType<typeof usersModel.schemas.updateInput.parse>>;

    // An empty object should be assignable to UpdateType since all fields are optional
    type _t1 = Expect<Extends<{}, UpdateType>>;
  });
});

// ---------------------------------------------------------------------------
// schemas.createInput — required vs optional distinction
// ---------------------------------------------------------------------------

describe('ModelDef schemas.createInput required vs optional', () => {
  it('columns with defaults are optional', () => {
    type CreateType = Unwrap<ReturnType<typeof usersModel.schemas.createInput.parse>>;

    // Should compile: role is optional (has default 'viewer'), omitting it is valid
    type _t1 = Expect<Extends<{
      email: string;
      name: string;
      passwordHash: string;
    }, CreateType>>;
  });
});
