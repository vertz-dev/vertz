import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Fixture: table with readOnly, autoUpdate, and hidden columns
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

// ---------------------------------------------------------------------------
// Column metadata type narrowing for .readOnly() and .autoUpdate()
// ---------------------------------------------------------------------------

describe('Column metadata type narrowing', () => {
  it('.readOnly() narrows isReadOnly to true', () => {
    const col = d.text().readOnly();
    const _ro: typeof col._meta.isReadOnly = true;
    // @ts-expect-error -- isReadOnly is narrowed to true; false is not assignable
    const _notRo: typeof col._meta.isReadOnly = false;
    void _ro;
    void _notRo;
  });

  it('.autoUpdate() narrows isAutoUpdate to true', () => {
    const col = d.timestamp().autoUpdate();
    const _au: typeof col._meta.isAutoUpdate = true;
    // @ts-expect-error -- isAutoUpdate is narrowed to true; false is not assignable
    const _notAu: typeof col._meta.isAutoUpdate = false;
    void _au;
    void _notAu;
  });

  it('.autoUpdate() also narrows isReadOnly to true', () => {
    const col = d.timestamp().autoUpdate();
    const _ro: typeof col._meta.isReadOnly = true;
    // @ts-expect-error -- isReadOnly is narrowed to true (implied by autoUpdate); false is not assignable
    const _notRo: typeof col._meta.isReadOnly = false;
    void _ro;
    void _notRo;
  });
});

// ---------------------------------------------------------------------------
// $response — excludes hidden columns
// ---------------------------------------------------------------------------

describe('$response', () => {
  it('excludes hidden columns', () => {
    type Response = typeof users.$response;

    // passwordHash is .is('hidden') — should NOT appear on $response
    expectTypeOf<Response>().not.toHaveProperty('passwordHash');
  });
});

// ---------------------------------------------------------------------------
// $create_input — excludes readOnly and PK columns
// ---------------------------------------------------------------------------

describe('$create_input', () => {
  it('excludes readOnly columns', () => {
    type CreateInput = typeof users.$create_input;

    // createdAt is .readOnly() — should NOT appear on $create_input
    expectTypeOf<CreateInput>().not.toHaveProperty('createdAt');
    // updatedAt is .autoUpdate() (implies readOnly) — should NOT appear
    expectTypeOf<CreateInput>().not.toHaveProperty('updatedAt');
  });

  it('excludes primary key columns', () => {
    type CreateInput = typeof users.$create_input;

    // id is .primary() — should NOT appear on $create_input
    expectTypeOf<CreateInput>().not.toHaveProperty('id');
  });

  it('includes non-readOnly, non-PK columns and makes defaulted ones optional', () => {
    type CreateInput = typeof users.$create_input;

    // email and name have no default — required
    const _valid: CreateInput = {
      email: 'alice@example.com',
      name: 'Alice',
      passwordHash: 'hash',
    };
    void _valid;

    // role has a default — optional
    const _withOptional: CreateInput = {
      email: 'alice@example.com',
      name: 'Alice',
      passwordHash: 'hash',
      role: 'admin',
    };
    void _withOptional;
  });
});

// ---------------------------------------------------------------------------
// $update_input — excludes readOnly + PK, all fields optional
// ---------------------------------------------------------------------------

describe('$update_input', () => {
  it('excludes readOnly columns', () => {
    type UpdateInput = typeof users.$update_input;

    // createdAt is .readOnly() — should NOT appear
    expectTypeOf<UpdateInput>().not.toHaveProperty('createdAt');
    // updatedAt is .autoUpdate() — should NOT appear
    expectTypeOf<UpdateInput>().not.toHaveProperty('updatedAt');
  });

  it('excludes primary key and makes all remaining fields optional', () => {
    type UpdateInput = typeof users.$update_input;

    // id is .primary() — should NOT appear
    expectTypeOf<UpdateInput>().not.toHaveProperty('id');

    // All remaining fields are optional — empty object is valid
    const _empty: UpdateInput = {};
    const _partial: UpdateInput = { name: 'New Name' };
    const _multi: UpdateInput = { email: 'new@example.com', role: 'admin' };
    void _empty;
    void _partial;
    void _multi;
  });
});
