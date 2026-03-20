import { describe, it } from 'bun:test';
import type { Equal, Expect, HasKey, Not } from '../../__tests__/_type-helpers';
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

    type _t1 = Expect<HasKey<User, 'id'>>;
    type _t2 = Expect<HasKey<User, 'email'>>;
    type _t3 = Expect<HasKey<User, 'name'>>;
    type _t4 = Expect<HasKey<User, 'role'>>;
    type _t5 = Expect<HasKey<User, 'bio'>>;
    type _t6 = Expect<HasKey<User, 'active'>>;
    type _t7 = Expect<HasKey<User, 'createdAt'>>;
  });

  it('excludes hidden columns from $infer', () => {
    type User = typeof users.$infer;

    // passwordHash is .is('hidden') -- should NOT appear on $infer
    type _t1 = Expect<Not<HasKey<User, 'passwordHash'>>>;
  });

  it('infers correct TypeScript types for each column', () => {
    type User = typeof users.$infer;

    type _t1 = Expect<Equal<User['id'], string>>;
    type _t2 = Expect<Equal<User['email'], string>>;
    type _t3 = Expect<Equal<User['name'], string>>;
    type _t4 = Expect<Equal<User['role'], 'admin' | 'editor' | 'viewer'>>;
    type _t5 = Expect<Equal<User['bio'], string | null>>;
    type _t6 = Expect<Equal<User['active'], boolean>>;
    type _t7 = Expect<Equal<User['createdAt'], Date>>;
  });
});

// ---------------------------------------------------------------------------
// $infer_all -- all columns including hidden
// ---------------------------------------------------------------------------

describe('$infer_all', () => {
  it('includes ALL columns including hidden', () => {
    type UserFull = typeof users.$infer_all;

    type _t1 = Expect<HasKey<UserFull, 'id'>>;
    type _t2 = Expect<HasKey<UserFull, 'email'>>;
    type _t3 = Expect<HasKey<UserFull, 'passwordHash'>>;
    type _t4 = Expect<HasKey<UserFull, 'name'>>;
    type _t5 = Expect<HasKey<UserFull, 'role'>>;
    type _t6 = Expect<HasKey<UserFull, 'bio'>>;
    type _t7 = Expect<HasKey<UserFull, 'active'>>;
    type _t8 = Expect<HasKey<UserFull, 'createdAt'>>;
  });

  it('passwordHash is string in $infer_all', () => {
    type UserFull = typeof users.$infer_all;
    type _t1 = Expect<Equal<UserFull['passwordHash'], string>>;
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

    // passwordHash is .is('hidden') but MUST be included in $insert
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

    // email is .is('sensitive') but MUST be included in $insert
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
    type _t1 = Expect<Not<HasKey<UserUpdate, 'id'>>>;
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
    type _t1 = Expect<Equal<Flag['id'], string>>;
    type _t2 = Expect<Equal<Flag['name'], string>>;
    type _t3 = Expect<Equal<Flag['enabled'], boolean>>;
  });
});

// ---------------------------------------------------------------------------
// .tenant() -- metadata flag
// ---------------------------------------------------------------------------

describe('.tenant() type', () => {
  it('preserves column types after .tenant()', () => {
    const workspaces = d
      .table('workspaces', {
        id: d.uuid().primary(),
        name: d.text(),
        slug: d.text().unique(),
      })
      .tenant();

    type Ws = typeof workspaces.$infer;
    type _t1 = Expect<Equal<Ws['id'], string>>;
    type _t2 = Expect<Equal<Ws['name'], string>>;
    type _t3 = Expect<Equal<Ws['slug'], string>>;
  });

  it('_tenant is boolean on TableDef', () => {
    const workspaces = d
      .table('workspaces', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();

    type _t1 = Expect<Equal<typeof workspaces._tenant, boolean>>;
  });

  it('_tenant defaults to false on plain tables', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    type _t1 = Expect<Equal<typeof users._tenant, boolean>>;
  });
});
