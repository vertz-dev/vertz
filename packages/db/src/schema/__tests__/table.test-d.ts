import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Fixture: define a table with various column modifiers
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.email().unique().is('sensitive'),
  passwordHash: d.text().is('hidden'),
  name: d.text(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  bio: d.text().nullable(),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
});

// ---------------------------------------------------------------------------
// $infer -- default SELECT, excludes hidden columns
// ---------------------------------------------------------------------------

describe('$infer', () => {
  it('includes all non-hidden columns with correct types', () => {
    type User = typeof users.$infer;

    expectTypeOf<User>().toHaveProperty('id');
    expectTypeOf<User>().toHaveProperty('email');
    expectTypeOf<User>().toHaveProperty('name');
    expectTypeOf<User>().toHaveProperty('role');
    expectTypeOf<User>().toHaveProperty('bio');
    expectTypeOf<User>().toHaveProperty('active');
    expectTypeOf<User>().toHaveProperty('createdAt');
  });

  it('excludes hidden columns from $infer', () => {
    type User = typeof users.$infer;

    // passwordHash is .hidden() -- should NOT appear on $infer
    expectTypeOf<User>().not.toHaveProperty('passwordHash');
  });

  it('infers correct TypeScript types for each column', () => {
    type User = typeof users.$infer;

    expectTypeOf<User['id']>().toEqualTypeOf<string>();
    expectTypeOf<User['email']>().toEqualTypeOf<string>();
    expectTypeOf<User['name']>().toEqualTypeOf<string>();
    expectTypeOf<User['role']>().toEqualTypeOf<'admin' | 'editor' | 'viewer'>();
    expectTypeOf<User['bio']>().toEqualTypeOf<string | null>();
    expectTypeOf<User['active']>().toEqualTypeOf<boolean>();
    expectTypeOf<User['createdAt']>().toEqualTypeOf<Date>();
  });
});

// ---------------------------------------------------------------------------
// $infer_all -- all columns including hidden
// ---------------------------------------------------------------------------

describe('$infer_all', () => {
  it('includes ALL columns including hidden', () => {
    type UserFull = typeof users.$infer_all;

    expectTypeOf<UserFull>().toHaveProperty('id');
    expectTypeOf<UserFull>().toHaveProperty('email');
    expectTypeOf<UserFull>().toHaveProperty('passwordHash');
    expectTypeOf<UserFull>().toHaveProperty('name');
    expectTypeOf<UserFull>().toHaveProperty('role');
    expectTypeOf<UserFull>().toHaveProperty('bio');
    expectTypeOf<UserFull>().toHaveProperty('active');
    expectTypeOf<UserFull>().toHaveProperty('createdAt');
  });

  it('passwordHash is string in $infer_all', () => {
    type UserFull = typeof users.$infer_all;
    expectTypeOf<UserFull['passwordHash']>().toEqualTypeOf<string>();
  });
});

// ---------------------------------------------------------------------------
// $insert -- write type, defaulted columns optional, includes ALL columns
// ---------------------------------------------------------------------------

describe('$insert', () => {
  it('makes defaulted columns optional', () => {
    type UserInsert = typeof users.$insert;

    // Required fields (no default): email, passwordHash, name, bio
    // Note: bio is nullable but has no default, so it's required
    const _valid: UserInsert = {
      email: 'alice@example.com',
      passwordHash: 'hash',
      name: 'Alice',
      bio: null,
    };
    void _valid;
  });

  it('allows optional fields with defaults to be omitted', () => {
    type UserInsert = typeof users.$insert;

    // id (primary -> has default), role, active, createdAt have defaults
    const _validWithOptionals: UserInsert = {
      email: 'alice@example.com',
      passwordHash: 'hash',
      name: 'Alice',
      bio: 'A bio',
      id: 'custom-uuid',
      role: 'admin',
      active: false,
      createdAt: new Date(),
    };
    void _validWithOptionals;
  });

  it('includes hidden columns (visibility is read-side only)', () => {
    type UserInsert = typeof users.$insert;

    // passwordHash is .hidden() but MUST be included in $insert
    const _valid: UserInsert = {
      email: 'e@x.com',
      passwordHash: 'hash123',
      name: 'Test',
      bio: null,
    };
    void _valid;
  });

  it('includes sensitive columns (visibility is read-side only)', () => {
    type UserInsert = typeof users.$insert;

    // email is .sensitive() but MUST be included in $insert
    const _valid: UserInsert = {
      email: 'sensitive@example.com',
      passwordHash: 'hash',
      name: 'Test',
      bio: null,
    };
    void _valid;
  });

  it('rejects missing required fields', () => {
    type UserInsert = typeof users.$insert;

    // @ts-expect-error -- name is required (no default), cannot be omitted
    const _invalid: UserInsert = {
      email: 'e@x.com',
      passwordHash: 'hash',
      bio: null,
    };
    void _invalid;
  });
});

// ---------------------------------------------------------------------------
// $update -- all non-PK columns optional, includes ALL columns
// ---------------------------------------------------------------------------

describe('$update', () => {
  it('makes all non-primary-key columns optional', () => {
    type UserUpdate = typeof users.$update;

    // All fields are optional in update
    const _valid: UserUpdate = {};
    const _partial: UserUpdate = { name: 'New Name' };
    const _multi: UserUpdate = { email: 'new@example.com', active: false };
    void _valid;
    void _partial;
    void _multi;
  });

  it('excludes primary key from update', () => {
    type UserUpdate = typeof users.$update;

    // id is primary -- should NOT appear on $update
    expectTypeOf<UserUpdate>().not.toHaveProperty('id');
  });

  it('includes hidden columns in update (visibility is read-side only)', () => {
    type UserUpdate = typeof users.$update;

    const _valid: UserUpdate = { passwordHash: 'newhash' };
    void _valid;
  });

  it('includes sensitive columns in update (visibility is read-side only)', () => {
    type UserUpdate = typeof users.$update;

    const _valid: UserUpdate = { email: 'updated@example.com' };
    void _valid;
  });
});

// ---------------------------------------------------------------------------
// d.tenant() -- type-level tests
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const tenantUsers = d.table('tenant_users', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});

describe('d.tenant() type inference', () => {
  it('tenant column infers as string (UUID type)', () => {
    type TUser = typeof tenantUsers.$infer;
    expectTypeOf<TUser['organizationId']>().toEqualTypeOf<string>();
  });

  it('tenant column carries isTenant: true in metadata type', () => {
    const _isTenant: typeof tenantUsers._columns.organizationId._meta.isTenant = true;
    // @ts-expect-error -- isTenant is true on a tenant column, false should not be assignable
    const _notTenant: typeof tenantUsers._columns.organizationId._meta.isTenant = false;
    void _isTenant;
    void _notTenant;
  });

  it('tenant column carries references metadata in type', () => {
    type Refs = typeof tenantUsers._columns.organizationId._meta.references;
    expectTypeOf<Refs>().toEqualTypeOf<{ readonly table: string; readonly column: string }>();
  });

  it('non-tenant columns have isTenant: false in metadata type', () => {
    const _notTenant: typeof tenantUsers._columns.name._meta.isTenant = false;
    // @ts-expect-error -- isTenant is false on a regular column, true should not be assignable
    const _isTenant: typeof tenantUsers._columns.name._meta.isTenant = true;
    void _notTenant;
    void _isTenant;
  });

  it('tenant column is required in $insert (no default)', () => {
    type TInsert = typeof tenantUsers.$insert;

    // organizationId is required -- no default on a tenant column
    const _valid: TInsert = {
      organizationId: 'org-uuid',
      name: 'Alice',
    };
    void _valid;
  });
});

// ---------------------------------------------------------------------------
// .shared() -- metadata flag
// ---------------------------------------------------------------------------

describe('.shared() type', () => {
  it('preserves column types after .shared()', () => {
    const flags = d
      .table('feature_flags', {
        id: d.uuid().primary(),
        name: d.text().unique(),
        enabled: d.boolean().default(false),
      })
      .shared();

    type Flag = typeof flags.$infer;
    expectTypeOf<Flag['id']>().toEqualTypeOf<string>();
    expectTypeOf<Flag['name']>().toEqualTypeOf<string>();
    expectTypeOf<Flag['enabled']>().toEqualTypeOf<boolean>();
  });
});
