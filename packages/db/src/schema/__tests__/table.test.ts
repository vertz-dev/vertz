import { describe, expect, it } from 'bun:test';
import { d } from '../../d';

describe('d.table()', () => {
  it('creates a table definition with name and columns', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    expect(users._name).toBe('users');
    expect(users._columns.id._meta.primary).toBe(true);
    expect(users._columns.name._meta.sqlType).toBe('text');
  });

  it('carries column metadata through the table definition', () => {
    const posts = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text().unique(),
      content: d.text().nullable(),
      status: d.enum('post_status', ['draft', 'published']).default('draft'),
    });

    expect(posts._columns.title._meta.unique).toBe(true);
    expect(posts._columns.content._meta.nullable).toBe(true);
    expect(posts._columns.status._meta.hasDefault).toBe(true);
    expect(posts._columns.status._meta.defaultValue).toBe('draft');
  });
});

describe('d.index()', () => {
  it('creates a single-column index definition', () => {
    const idx = d.index('status');
    expect(idx.columns).toEqual(['status']);
  });

  it('creates a composite index definition', () => {
    const idx = d.index(['authorId', 'createdAt']);
    expect(idx.columns).toEqual(['authorId', 'createdAt']);
  });
});

describe('table options', () => {
  it('stores index definitions on the table', () => {
    const posts = d.table(
      'posts',
      {
        id: d.uuid().primary(),
        status: d.text(),
        authorId: d.uuid(),
        createdAt: d.timestamp().default('now'),
      },
      {
        indexes: [d.index('status'), d.index(['authorId', 'createdAt'])],
      },
    );

    expect(posts._indexes).toHaveLength(2);
    expect(posts._indexes[0].columns).toEqual(['status']);
    expect(posts._indexes[1].columns).toEqual(['authorId', 'createdAt']);
  });

  it('defaults indexes to empty array when not provided', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    expect(users._indexes).toEqual([]);
  });
});

describe('d.tenant() in table definition', () => {
  it('tenant column metadata is accessible from the table definition', () => {
    const organizations = d.table('organizations', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const users = d.table('users', {
      id: d.uuid().primary(),
      organizationId: d.tenant(organizations),
      name: d.text(),
    });

    const orgIdMeta = users._columns.organizationId._meta;
    expect(orgIdMeta.sqlType).toBe('uuid');
    expect(orgIdMeta.isTenant).toBe(true);
    expect(orgIdMeta.references).toEqual({ table: 'organizations', column: 'id' });
  });

  it('non-tenant columns in the same table have isTenant false', () => {
    const organizations = d.table('organizations', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const users = d.table('users', {
      id: d.uuid().primary(),
      organizationId: d.tenant(organizations),
      name: d.text(),
    });

    expect(users._columns.id._meta.isTenant).toBe(false);
    expect(users._columns.name._meta.isTenant).toBe(false);
  });
});

describe('.shared()', () => {
  it('sets the shared metadata flag on a table', () => {
    const featureFlags = d
      .table('feature_flags', {
        id: d.uuid().primary(),
        name: d.text().unique(),
        enabled: d.boolean().default(false),
      })
      .shared();

    expect(featureFlags._shared).toBe(true);
  });

  it('defaults shared to false', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    expect(users._shared).toBe(false);
  });

  it('shared metadata is accessible from the table definition', () => {
    const plans = d
      .table('plans', {
        id: d.uuid().primary(),
        name: d.text(),
        price: d.integer(),
      })
      .shared();

    expect(plans._shared).toBe(true);
    expect(plans._name).toBe('plans');
    expect(plans._columns.name._meta.sqlType).toBe('text');
  });

  it('preserves column metadata after calling .shared()', () => {
    const lookups = d
      .table('lookups', {
        id: d.uuid().primary(),
        key: d.text().unique(),
        value: d.text().nullable(),
      })
      .shared();

    expect(lookups._columns.key._meta.unique).toBe(true);
    expect(lookups._columns.value._meta.nullable).toBe(true);
  });
});
