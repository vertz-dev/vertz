import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Fixture: define a table with various column modifiers
// ---------------------------------------------------------------------------
const _users = d.table('users', {
  id: d.uuid().primary(),
  email: d.email().unique().sensitive(),
  passwordHash: d.text().hidden(),
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
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('email');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('role');
    expectTypeOf().toHaveProperty('bio');
    expectTypeOf().toHaveProperty('active');
    expectTypeOf().toHaveProperty('createdAt');
  });
  it('excludes hidden columns from $infer', () => {
    // passwordHash is .hidden() -- should NOT appear on $infer
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
  it('infers correct TypeScript types for each column', () => {
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// $infer_all -- all columns including hidden
// ---------------------------------------------------------------------------
describe('$infer_all', () => {
  it('includes ALL columns including hidden', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('email');
    expectTypeOf().toHaveProperty('passwordHash');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('role');
    expectTypeOf().toHaveProperty('bio');
    expectTypeOf().toHaveProperty('active');
    expectTypeOf().toHaveProperty('createdAt');
  });
  it('passwordHash is string in $infer_all', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// $insert -- write type, defaulted columns optional, includes ALL columns
// ---------------------------------------------------------------------------
describe('$insert', () => {
  it('makes defaulted columns optional', () => {
    // Required fields (no default): email, passwordHash, name, bio
    // Note: bio is nullable but has no default, so it's required
    const _valid = {
      email: 'alice@example.com',
      passwordHash: 'hash',
      name: 'Alice',
      bio: null,
    };
    void _valid;
  });
  it('allows optional fields with defaults to be omitted', () => {
    // id (primary -> has default), role, active, createdAt have defaults
    const _validWithOptionals = {
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
    // passwordHash is .hidden() but MUST be included in $insert
    const _valid = {
      email: 'e@x.com',
      passwordHash: 'hash123',
      name: 'Test',
      bio: null,
    };
    void _valid;
  });
  it('includes sensitive columns (visibility is read-side only)', () => {
    // email is .sensitive() but MUST be included in $insert
    const _valid = {
      email: 'sensitive@example.com',
      passwordHash: 'hash',
      name: 'Test',
      bio: null,
    };
    void _valid;
  });
  it('rejects missing required fields', () => {
    // @ts-expect-error -- name is required (no default), cannot be omitted
    const _invalid = {
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
    // All fields are optional in update
    const _valid = {};
    const _partial = { name: 'New Name' };
    const _multi = { email: 'new@example.com', active: false };
    void _valid;
    void _partial;
    void _multi;
  });
  it('excludes primary key from update', () => {
    // id is primary -- should NOT appear on $update
    expectTypeOf().not.toHaveProperty('id');
  });
  it('includes hidden columns in update (visibility is read-side only)', () => {
    const _valid = { passwordHash: 'newhash' };
    void _valid;
  });
  it('includes sensitive columns in update (visibility is read-side only)', () => {
    const _valid = { email: 'updated@example.com' };
    void _valid;
  });
});
// ---------------------------------------------------------------------------
// $not_sensitive -- excludes sensitive and hidden columns
// ---------------------------------------------------------------------------
describe('$not_sensitive', () => {
  it('excludes sensitive columns', () => {
    // email is .sensitive() -- should NOT appear
    expectTypeOf().not.toHaveProperty('email');
  });
  it('excludes hidden columns (hidden implies sensitive for reads)', () => {
    // passwordHash is .hidden() -- should NOT appear on $not_sensitive either
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
  it('includes normal columns', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('role');
    expectTypeOf().toHaveProperty('bio');
    expectTypeOf().toHaveProperty('active');
    expectTypeOf().toHaveProperty('createdAt');
  });
  it('rejects assigning sensitive field to $not_sensitive type', () => {
    const _valid = {
      id: 'uuid',
      name: 'Alice',
      role: 'admin',
      bio: null,
      active: true,
      createdAt: new Date(),
    };
    void _valid;
    // email is sensitive -- should not exist as a key on $not_sensitive
    expectTypeOf().not.toHaveProperty('email');
    // passwordHash is hidden -- should not exist as a key on $not_sensitive
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
});
// ---------------------------------------------------------------------------
// $not_hidden -- excludes hidden columns only
// ---------------------------------------------------------------------------
describe('$not_hidden', () => {
  it('excludes hidden columns', () => {
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
  it('includes sensitive (non-hidden) columns', () => {
    // email is .sensitive() but NOT .hidden() -- should be included
    expectTypeOf().toHaveProperty('email');
  });
  it('includes normal columns', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
  });
});
// ---------------------------------------------------------------------------
// d.tenant() -- type-level tests
// ---------------------------------------------------------------------------
const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});
const _tenantUsers = d.table('tenant_users', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});
describe('d.tenant() type inference', () => {
  it('tenant column infers as string (UUID type)', () => {
    expectTypeOf().toEqualTypeOf();
  });
  it('tenant column carries isTenant: true in metadata type', () => {
    const _isTenant = true;
    // @ts-expect-error -- isTenant is true on a tenant column, false should not be assignable
    const _notTenant = false;
    void _isTenant;
    void _notTenant;
  });
  it('tenant column carries references metadata in type', () => {
    expectTypeOf().toEqualTypeOf();
  });
  it('non-tenant columns have isTenant: false in metadata type', () => {
    const _notTenant = false;
    // @ts-expect-error -- isTenant is false on a regular column, true should not be assignable
    const _isTenant = true;
    void _notTenant;
    void _isTenant;
  });
  it('tenant column is required in $insert (no default)', () => {
    // organizationId is required -- no default on a tenant column
    const _valid = {
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
    const _flags = d
      .table('feature_flags', {
        id: d.uuid().primary(),
        name: d.text().unique(),
        enabled: d.boolean().default(false),
      })
      .shared();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
});
//# sourceMappingURL=table.test-d.js.map
