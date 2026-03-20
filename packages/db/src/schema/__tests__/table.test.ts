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

  it('creates an index with type option', () => {
    const idx = d.index('title', { type: 'gin' });
    expect(idx.columns).toEqual(['title']);
    expect(idx.type).toBe('gin');
  });

  it('creates an index with where option (partial index)', () => {
    const idx = d.index('email', { where: 'is_active = true' });
    expect(idx.columns).toEqual(['email']);
    expect(idx.where).toBe('is_active = true');
  });

  it('creates an index with unique and type options combined', () => {
    const idx = d.index(['email'], { unique: true, type: 'btree' });
    expect(idx.columns).toEqual(['email']);
    expect(idx.unique).toBe(true);
    expect(idx.type).toBe('btree');
  });

  it('rejects where clause containing dangerous SQL patterns', () => {
    expect(() => d.index('email', { where: '1=1; DROP TABLE users;--' })).toThrow(
      'Unsafe WHERE clause',
    );
  });

  it('allows safe where clause expressions', () => {
    expect(() => d.index('email', { where: "status = 'active'" })).not.toThrow();
    expect(() => d.index('email', { where: 'is_deleted = false' })).not.toThrow();
    expect(() => d.index('email', { where: "status != 'archived'" })).not.toThrow();
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

describe('.tenant()', () => {
  it('sets the tenant metadata flag on a table', () => {
    const workspaces = d
      .table('workspaces', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();

    expect(workspaces._tenant).toBe(true);
  });

  it('defaults tenant to false', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    expect(users._tenant).toBe(false);
  });

  it('preserves column metadata after calling .tenant()', () => {
    const workspaces = d
      .table('workspaces', {
        id: d.uuid().primary(),
        name: d.text().unique(),
        slug: d.text().nullable(),
      })
      .tenant();

    expect(workspaces._name).toBe('workspaces');
    expect(workspaces._columns.name._meta.unique).toBe(true);
    expect(workspaces._columns.slug._meta.nullable).toBe(true);
  });

  it('preserves indexes after calling .tenant()', () => {
    const workspaces = d
      .table(
        'workspaces',
        {
          id: d.uuid().primary(),
          slug: d.text(),
        },
        { indexes: [d.index('slug', { unique: true })] },
      )
      .tenant();

    expect(workspaces._indexes).toHaveLength(1);
    expect(workspaces._indexes[0].unique).toBe(true);
  });

  it('throws when called on a .shared() table', () => {
    const shared = d
      .table('shared_items', { id: d.uuid().primary(), name: d.text() })
      .shared();

    expect(() => shared.tenant()).toThrow(/already marked as \.shared\(\)/);
  });
});

describe('.shared() / .tenant() mutual exclusion', () => {
  it('throws when .shared() is called on a .tenant() table', () => {
    const tenant = d
      .table('orgs', { id: d.uuid().primary(), name: d.text() })
      .tenant();

    expect(() => tenant.shared()).toThrow(/already marked as \.tenant\(\)/);
  });
});

describe('phantom type getters', () => {
  const users = d.table('users', {
    id: d.uuid().primary(),
    name: d.text(),
    email: d.text().nullable(),
  });

  it('$infer returns undefined at runtime', () => {
    expect(users.$infer).toBeUndefined();
  });

  it('$infer_all returns undefined at runtime', () => {
    expect(users.$infer_all).toBeUndefined();
  });

  it('$insert returns undefined at runtime', () => {
    expect(users.$insert).toBeUndefined();
  });

  it('$update returns undefined at runtime', () => {
    expect(users.$update).toBeUndefined();
  });

  it('$response returns undefined at runtime', () => {
    expect(users.$response).toBeUndefined();
  });

  it('$create_input returns undefined at runtime', () => {
    expect(users.$create_input).toBeUndefined();
  });

  it('$update_input returns undefined at runtime', () => {
    expect(users.$update_input).toBeUndefined();
  });
});
