import { describe, expect, it, vi } from 'vitest';
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
  email: d.email(),
});

const projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid().references('projects', 'id'),
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
  it('returns a Database instance with _tables', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      tables: {
        organizations: { table: organizations, relations: {} },
        users: { table: users, relations: {} },
      },
    });

    expect(db._tables).toBeDefined();
    expect(db._tables.organizations).toBeDefined();
    expect(db._tables.users).toBeDefined();
  });

  it('computes tenant graph and exposes it as $tenantGraph', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      tables: {
        organizations: { table: organizations, relations: {} },
        users: { table: users, relations: {} },
        projects: { table: projects, relations: {} },
        tasks: { table: tasks, relations: {} },
        featureFlags: { table: featureFlags, relations: {} },
      },
    });

    expect(db.$tenantGraph).toBeDefined();
    expect(db.$tenantGraph.root).toBe('organizations');
    expect(db.$tenantGraph.directlyScoped).toContain('users');
    expect(db.$tenantGraph.directlyScoped).toContain('projects');
    expect(db.$tenantGraph.indirectlyScoped).toContain('tasks');
    expect(db.$tenantGraph.shared).toContain('featureFlags');
  });

  it('logs a notice for tables without tenant path and not shared', () => {
    const logFn = vi.fn();

    createDb({
      url: 'postgres://localhost:5432/test',
      tables: {
        organizations: { table: organizations, relations: {} },
        users: { table: users, relations: {} },
        auditLogs: { table: auditLogs, relations: {} },
      },
      log: logFn,
    });

    expect(logFn).toHaveBeenCalledWith(expect.stringContaining('audit_logs'));
  });

  it('does not log for tables that are scoped or shared', () => {
    const logFn = vi.fn();

    createDb({
      url: 'postgres://localhost:5432/test',
      tables: {
        organizations: { table: organizations, relations: {} },
        users: { table: users, relations: {} },
        featureFlags: { table: featureFlags, relations: {} },
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
      tables: {
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
      tables: {
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
      tables: {
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
      tables: {
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
      tables: {
        organizations: { table: organizations, relations: {} },
      },
    });

    expect(typeof db.query).toBe('function');
  });

  it('throws when no url and no _queryFn are provided', async () => {
    const db = createDb({
      url: '',
      tables: {
        organizations: { table: organizations, relations: {} },
      },
    });

    await expect(db.query({ _tag: 'SqlFragment', sql: 'SELECT 1', params: [] })).rejects.toThrow(
      'db.query() requires a connected postgres driver',
    );
  });
});
