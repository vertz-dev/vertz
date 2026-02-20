import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Fixture: table with hidden, readOnly, autoUpdate, and default columns
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
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
    type ResponseType = ReturnType<typeof usersModel.schemas.response.parse>;

    // passwordHash is .hidden() — should NOT appear
    expectTypeOf<ResponseType>().not.toHaveProperty('passwordHash');
  });

  it('includes non-hidden columns', () => {
    type ResponseType = ReturnType<typeof usersModel.schemas.response.parse>;

    expectTypeOf<ResponseType>().toHaveProperty('id');
    expectTypeOf<ResponseType>().toHaveProperty('email');
    expectTypeOf<ResponseType>().toHaveProperty('name');
  });
});

// ---------------------------------------------------------------------------
// schemas.createInput — type excludes readOnly and PK columns
// ---------------------------------------------------------------------------

describe('ModelDef schemas.createInput type', () => {
  it('excludes readOnly columns from the parsed result', () => {
    type CreateType = ReturnType<typeof usersModel.schemas.createInput.parse>;

    // createdAt is .readOnly() — should NOT appear
    expectTypeOf<CreateType>().not.toHaveProperty('createdAt');
    // updatedAt is .autoUpdate() (implies readOnly) — should NOT appear
    expectTypeOf<CreateType>().not.toHaveProperty('updatedAt');
  });

  it('excludes primary key columns', () => {
    type CreateType = ReturnType<typeof usersModel.schemas.createInput.parse>;

    expectTypeOf<CreateType>().not.toHaveProperty('id');
  });

  it('includes non-readOnly, non-PK columns', () => {
    type CreateType = ReturnType<typeof usersModel.schemas.createInput.parse>;

    expectTypeOf<CreateType>().toHaveProperty('email');
    expectTypeOf<CreateType>().toHaveProperty('name');
    // hidden but non-readOnly — included in createInput
    expectTypeOf<CreateType>().toHaveProperty('passwordHash');
  });
});

// ---------------------------------------------------------------------------
// schemas.updateInput — type excludes readOnly + PK, all optional
// ---------------------------------------------------------------------------

describe('ModelDef schemas.updateInput type', () => {
  it('excludes readOnly columns', () => {
    type UpdateType = ReturnType<typeof usersModel.schemas.updateInput.parse>;

    expectTypeOf<UpdateType>().not.toHaveProperty('createdAt');
    expectTypeOf<UpdateType>().not.toHaveProperty('updatedAt');
  });

  it('excludes primary key columns', () => {
    type UpdateType = ReturnType<typeof usersModel.schemas.updateInput.parse>;

    expectTypeOf<UpdateType>().not.toHaveProperty('id');
  });

  it('makes all remaining fields optional (empty object is valid)', () => {
    type UpdateType = ReturnType<typeof usersModel.schemas.updateInput.parse>;

    // An empty object should be assignable to UpdateType since all fields are optional
    expectTypeOf<{}>().toMatchTypeOf<UpdateType>();
  });
});

// ---------------------------------------------------------------------------
// schemas.createInput — required vs optional distinction
// ---------------------------------------------------------------------------

describe('ModelDef schemas.createInput required vs optional', () => {
  it('columns with defaults are optional', () => {
    type CreateType = ReturnType<typeof usersModel.schemas.createInput.parse>;

    // Should compile: role is optional (has default 'viewer'), omitting it is valid
    expectTypeOf<{ email: string; name: string; passwordHash: string }>()
      .toMatchTypeOf<CreateType>();
  });
});
