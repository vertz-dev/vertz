import { describe, expect, it, mock } from 'bun:test';
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
  organizationId: d.uuid(),
  name: d.text(),
  email: d.email(),
});

const projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid(),
  title: d.text(),
});

const featureFlags = d
  .table('feature_flags', {
    id: d.uuid().primary(),
    name: d.text().unique(),
    enabled: d.boolean().default(false),
  })
  .shared();

const auditLogs = d.table('audit_logs', {
  id: d.uuid().primary(),
  action: d.text(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDb', () => {
  it('returns a DatabaseClient with _internals.models', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
        users: { table: users, relations: {} },
      },
    });

    expect(db._internals.models).toBeDefined();
    expect(db._internals.models.organizations).toBeDefined();
    expect(db._internals.models.users).toBeDefined();
  });

  it('computes tenant graph and exposes it as _internals.tenantGraph', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(
          users,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        projects: d.model(
          projects,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        tasks: d.model(tasks, {
          project: d.ref.one(() => projects, 'projectId'),
        }),
        featureFlags: d.model(featureFlags),
      },
    });

    expect(db._internals.tenantGraph).toBeDefined();
    expect(db._internals.tenantGraph.root).toBe('organizations');
    expect(db._internals.tenantGraph.directlyScoped).toContain('users');
    expect(db._internals.tenantGraph.directlyScoped).toContain('projects');
    expect(db._internals.tenantGraph.indirectlyScoped).toContain('tasks');
    expect(db._internals.tenantGraph.shared).toContain('featureFlags');
  });

  it('logs a notice for tables without tenant path and not shared', () => {
    const logFn = mock();

    createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(
          users,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        auditLogs: d.model(auditLogs),
      },
      log: logFn,
    });

    expect(logFn).toHaveBeenCalledWith(expect.stringContaining('audit_logs'));
  });

  it('does not log for tables that are scoped or shared', () => {
    const logFn = mock();

    createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(
          users,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        featureFlags: d.model(featureFlags),
      },
      log: logFn,
    });

    expect(logFn).not.toHaveBeenCalled();
  });
});

describe('db.close()', () => {
  it('exists and returns a promise', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    const result = db.close();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});

describe('db.isHealthy()', () => {
  it('exists and returns a promise resolving to a boolean', async () => {
    // Use _queryFn to avoid creating a real connection
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = db.isHealthy();
    expect(result).toBeInstanceOf(Promise);
    // When using _queryFn (no real driver), isHealthy returns true
    await expect(result).resolves.toBe(true);
  });
});

describe('createDb pool config', () => {
  it('accepts optional pool configuration', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      pool: {
        max: 20,
        idleTimeout: 30000,
        connectionTimeout: 5000,
      },
    });

    expect(db).toBeDefined();
  });

  it('accepts optional casing configuration', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      casing: 'snake_case',
    });

    expect(db).toBeDefined();
  });
});

describe('db.query()', () => {
  it('exists on the database instance', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    expect(typeof db.query).toBe('function');
  });

  it('throws when no url and no _queryFn are provided', async () => {
    const db = createDb({
      url: '',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    const result = await db.query({ _tag: 'SqlFragment', sql: 'SELECT 1', params: [] });
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/db.query\(\) requires/);
  });

  it('#205: maps PG errors through parsePgError for consistent error hierarchy', async () => {
    // Simulate a postgres error with a PG error code (unique constraint violation)
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      table: 'users',
      constraint: 'users_email_key',
      detail: 'Key (email)=(test@test.com) already exists.',
    });

    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn as import('../../query/executor').QueryFn,
    });

    // db.query() should map the PG error to a UniqueConstraintError
    const result = await db.query({
      _tag: 'SqlFragment',
      sql: 'INSERT INTO users ...',
      params: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('QUERY_ERROR');
  });
});
