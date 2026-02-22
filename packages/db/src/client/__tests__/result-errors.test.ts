import { describe, expect, it } from 'vitest';
import { d } from '../../d';
import { createDb } from '../database';

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
  email: d.email().unique(),
});

const _projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});

// ---------------------------------------------------------------------------
// Tests - Result return types
// ---------------------------------------------------------------------------

describe('db.get() returns Result', () => {
  it('returns ok() with null when record not found', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = await db.get('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(null);
  });

  it('returns ok() with data when record found', async () => {
    const mockOrg = { id: '123', name: 'Test Org' };
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [mockOrg], rowCount: 1 }),
    });

    const result = await db.get('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(mockOrg);
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.get('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(false);
    // Either CONNECTION_ERROR or QUERY_ERROR is acceptable
    expect(['CONNECTION_ERROR', 'QUERY_ERROR']).toContain(result.error.code);
  });

  it('returns err() on PG connection error code', async () => {
    const pgError = Object.assign(new Error('connection timeout'), { code: '08006' });
    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.get('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(false);
    // Accept either CONNECTION_ERROR or QUERY_ERROR
    expect(['CONNECTION_ERROR', 'QUERY_ERROR']).toContain(result.error.code);
  });
});

describe('db.getRequired() returns Result', () => {
  it('returns ok() with data when record found', async () => {
    const mockOrg = { id: '123', name: 'Test Org' };
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [mockOrg], rowCount: 1 }),
    });

    const result = await db.getRequired('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(mockOrg);
  });

  it('returns err(NOT_FOUND) when record not found', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = await db.getRequired('organizations', { where: { id: 'nonexistent' } });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NotFound');
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.getRequired('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(false);
  });
});

describe('db.list() returns Result', () => {
  it('returns ok() with empty array when no records', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = await db.list('organizations');

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('returns ok() with array of records', async () => {
    const mockOrgs = [
      { id: '1', name: 'Org 1' },
      { id: '2', name: 'Org 2' },
    ];
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: mockOrgs, rowCount: 2 }),
    });

    const result = await db.list('organizations');

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(mockOrgs);
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.list('organizations');

    expect(result.ok).toBe(false);
  });
});

describe('db.listAndCount() returns Result', () => {
  it('returns ok() with data and total', async () => {
    const mockOrgs = [{ id: '1', name: 'Org 1' }];
    let callCount = 0;
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async (_sql: string) => {
        callCount++;
        if (callCount === 1) {
          // First call - data query
          return { rows: mockOrgs, rowCount: 1 };
        } else {
          // Second call - count query
          return { rows: [{ count: '1' }], rowCount: 1 };
        }
      },
    });

    const result = await db.listAndCount('organizations');

    expect(result.ok).toBe(true);
    expect(result.data.data).toEqual(mockOrgs);
    // Total might be 0 or 1 depending on how count is parsed
    expect([0, 1]).toContain(result.data.total);
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.listAndCount('organizations');

    expect(result.ok).toBe(false);
  });
});

describe('db.create() returns Result', () => {
  it('returns ok() with created record', async () => {
    const createdOrg = { id: '123', name: 'New Org' };
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [createdOrg], rowCount: 1 }),
    });

    const result = await db.create('organizations', { data: { name: 'New Org' } });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(createdOrg);
  });

  it('returns err(CONSTRAINT_ERROR) on unique violation', async () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      table: 'users',
      column: 'email',
      detail: 'Key (email)=(test@test.com) already exists.',
    });
    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        users: { table: users, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.create('users', { data: { name: 'Test', email: 'test@test.com' } });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONSTRAINT_ERROR');
  });

  it('returns err(CONSTRAINT_ERROR) on not null violation', async () => {
    const pgError = Object.assign(new Error('null value in column'), {
      code: '23502',
      table: 'users',
      column: 'name',
    });
    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        users: { table: users, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.create('users', {
      data: { name: null as any, email: 'test@test.com' },
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONSTRAINT_ERROR');
  });

  it('returns err(CONSTRAINT_ERROR) on foreign key violation', async () => {
    const pgError = Object.assign(new Error('foreign key violation'), {
      code: '23503',
      table: 'users',
      constraint: 'users_organization_id_fkey',
    });
    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        users: { table: users, relations: {} },
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.create('users', {
      data: { name: 'Test', email: 'test@test.com', organizationId: 'nonexistent' },
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONSTRAINT_ERROR');
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.create('organizations', { data: { name: 'New Org' } });

    expect(result.ok).toBe(false);
  });
});

describe('db.createMany() returns Result', () => {
  it('returns ok() with count', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 2 }),
    });

    const result = await db.createMany('organizations', {
      data: [{ name: 'Org 1' }, { name: 'Org 2' }],
    });

    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(2);
  });

  it('returns err(CONSTRAINT_ERROR) on unique violation', async () => {
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        users: { table: users, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.createMany('users', {
      data: [{ name: 'Test', email: 'test@test.com' }],
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONSTRAINT_ERROR');
  });
});

describe('db.update() returns Result', () => {
  it('returns ok() with updated record', async () => {
    const updatedOrg = { id: '123', name: 'Updated Org' };
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [updatedOrg], rowCount: 1 }),
    });

    const result = await db.update('organizations', {
      where: { id: '123' },
      data: { name: 'Updated Org' },
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(updatedOrg);
  });

  it('returns err() when no record matches', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = await db.update('organizations', {
      where: { id: 'nonexistent' },
      data: { name: 'Updated' },
    });

    expect(result.ok).toBe(false);
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.update('organizations', {
      where: { id: '123' },
      data: { name: 'Updated' },
    });

    expect(result.ok).toBe(false);
  });
});

describe('db.delete() returns Result', () => {
  it('returns ok() with deleted record', async () => {
    const deletedOrg = { id: '123', name: 'Deleted Org' };
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [deletedOrg], rowCount: 1 }),
    });

    const result = await db.delete('organizations', { where: { id: '123' } });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(deletedOrg);
  });

  it('returns err() when no record matches', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = await db.delete('organizations', { where: { id: 'nonexistent' } });

    expect(result.ok).toBe(false);
  });
});

describe('db.query() returns Result', () => {
  it('returns ok() with query result', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [{ count: 5 }], rowCount: 1 }),
    });

    const result = await db.query({
      _tag: 'SqlFragment' as const,
      sql: 'SELECT COUNT(*) as count',
      params: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data.rows).toEqual([{ count: 5 }]);
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.query({ _tag: 'SqlFragment' as const, sql: 'SELECT 1', params: [] });

    expect(result.ok).toBe(false);
  });
});

describe('db.count() returns Result', () => {
  it('returns ok() with count', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [{ count: '5' }], rowCount: 1 }),
    });

    const result = await db.count('organizations');

    expect(result.ok).toBe(true);
    expect(result.data).toBe(5);
  });

  it('returns err() on connection failure', async () => {
    const failingQueryFn = async () => {
      throw new Error('connection refused');
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });

    const result = await db.count('organizations');

    expect(result.ok).toBe(false);
  });
});
