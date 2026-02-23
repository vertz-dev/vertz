/**
 * Tests for SQLite Adapter
 *
 * Uses bun:sqlite with :memory: database for fast, isolated tests.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createSqliteAdapter, createSqliteDriver, type SqliteAdapterOptions } from '../sqlite-adapter';
import { d } from '../../d';
import type { ColumnRecord } from '../../schema/table';
import type { DbDriver } from '../../client/driver';

// ---------------------------------------------------------------------------
// Test Schema
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary({ generate: 'uuid' }),
  name: d.text(),
  email: d.varchar(255),
  active: d.boolean().default(true),
  role: d.text().default('user'),
  createdAt: d.timestamp().default('now'),
});

type UsersSchema = typeof usersTable;

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

describe('SqliteAdapter', () => {
  let driver: DbDriver;
  let adapter: ReturnType<typeof createSqliteAdapter>;

  beforeEach(async () => {
    // Create in-memory SQLite database using bun:sqlite
    driver = createSqliteDriver(':memory:');

    // Create the adapter with auto-apply migrations
    adapter = await createSqliteAdapter<UsersSchema>({
      schema: usersTable,
      dbPath: ':memory:',
      migrations: { autoApply: true },
    } as SqliteAdapterOptions<UsersSchema>);
  });

  afterEach(async () => {
    await driver.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Create adapter with schema
  // ---------------------------------------------------------------------------

  it('should create adapter with schema and initialize table', async () => {
    expect(adapter).toBeDefined();
    expect(adapter).toHaveProperty('get');
    expect(adapter).toHaveProperty('list');
    expect(adapter).toHaveProperty('create');
    expect(adapter).toHaveProperty('update');
    expect(adapter).toHaveProperty('delete');
  });

  // ---------------------------------------------------------------------------
  // 2. Test create — inserts record, returns it with ID
  // ---------------------------------------------------------------------------

  it('should create a record and return it with generated ID', async () => {
    const result = await adapter.create({
      name: 'John Doe',
      email: 'john@example.com',
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe('John Doe');
    expect(result.email).toBe('john@example.com');
    expect(result.active).toBe(true); // default value
    expect(result.role).toBe('user'); // default value
    expect(result.createdAt).toBeDefined();
  });

  it('should create a record with all fields provided', async () => {
    const result = await adapter.create({
      id: 'test-uuid-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      active: false,
      role: 'admin',
    });

    expect(result.id).toBe('test-uuid-123');
    expect(result.name).toBe('Jane Doe');
    expect(result.email).toBe('jane@example.com');
    expect(result.active).toBe(false);
    expect(result.role).toBe('admin');
  });

  // ---------------------------------------------------------------------------
  // 3. Test list — returns all records
  // ---------------------------------------------------------------------------

  it('should list all records', async () => {
    // Create multiple records
    await adapter.create({ name: 'User 1', email: 'user1@example.com' });
    await adapter.create({ name: 'User 2', email: 'user2@example.com' });
    await adapter.create({ name: 'User 3', email: 'user3@example.com' });

    const result = await adapter.list();

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('should return empty array when no records exist', async () => {
    const result = await adapter.list();

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 4. Test list with filters (where clause)
  // ---------------------------------------------------------------------------

  it('should list records with filters', async () => {
    await adapter.create({ name: 'Active User', email: 'active@example.com', active: true });
    await adapter.create({ name: 'Inactive User', email: 'inactive@example.com', active: false });
    await adapter.create({ name: 'Another Active', email: 'another@example.com', active: true });

    const result = await adapter.list({ where: { active: true } });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.data.every(r => r.active === true)).toBe(true);
  });

  it('should list records with multiple filters', async () => {
    await adapter.create({ name: 'Admin User', email: 'admin@example.com', role: 'admin' });
    await adapter.create({ name: 'Regular User', email: 'user@example.com', role: 'user' });
    await adapter.create({ name: 'Another Admin', email: 'another-admin@example.com', role: 'admin' });

    const result = await adapter.list({ where: { role: 'admin' } });

    expect(result.data).toHaveLength(2);
    expect(result.data.every(r => r.role === 'admin')).toBe(true);
  });

  it('should support limit option', async () => {
    await adapter.create({ name: 'User 1', email: 'user1@example.com' });
    await adapter.create({ name: 'User 2', email: 'user2@example.com' });
    await adapter.create({ name: 'User 3', email: 'user3@example.com' });

    const result = await adapter.list({ limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 5. Test get by ID — returns record
  // ---------------------------------------------------------------------------

  it('should get a record by ID', async () => {
    const created = await adapter.create({ name: 'Get Test', email: 'get@example.com' });
    const id = created.id as string;

    const result = await adapter.get(id);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
    expect(result?.name).toBe('Get Test');
  });

  // ---------------------------------------------------------------------------
  // 6. Test get with invalid ID — returns null/error
  // ---------------------------------------------------------------------------

  it('should return null for non-existent ID', async () => {
    const result = await adapter.get('non-existent-uuid');

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 7. Test update — updates fields, returns updated record
  // ---------------------------------------------------------------------------

  it('should update a record and return updated data', async () => {
    const created = await adapter.create({ name: 'Original Name', email: 'original@example.com' });
    const id = created.id as string;

    const updated = await adapter.update(id, { name: 'Updated Name', active: false });

    expect(updated.name).toBe('Updated Name');
    expect(updated.active).toBe(false);
    expect(updated.id).toBe(id);
    // Fields not updated should remain unchanged
    expect(updated.email).toBe('original@example.com');
  });

  it('should update only provided fields', async () => {
    const created = await adapter.create({ name: 'Test', email: 'test@example.com', role: 'user' });
    const id = created.id as string;

    const updated = await adapter.update(id, { role: 'admin' });

    expect(updated.role).toBe('admin');
    expect(updated.name).toBe('Test');
    expect(updated.email).toBe('test@example.com');
  });

  it('should throw error when updating non-existent record', async () => {
    await expect(adapter.update('non-existent-id', { name: 'Test' })).rejects.toThrow('Record not found');
  });

  // ---------------------------------------------------------------------------
  // 8. Test delete — removes record
  // ---------------------------------------------------------------------------

  it('should delete a record and return the deleted data', async () => {
    const created = await adapter.create({ name: 'Delete Me', email: 'delete@example.com' });
    const id = created.id as string;

    const deleted = await adapter.delete(id);

    expect(deleted).not.toBeNull();
    expect(deleted?.name).toBe('Delete Me');

    // Verify it's actually deleted
    const result = await adapter.get(id);
    expect(result).toBeNull();
  });

  it('should return null when deleting non-existent record', async () => {
    const result = await adapter.delete('non-existent-id');

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 9. Test SQL injection protection — column whitelist
  // ---------------------------------------------------------------------------

  it('should throw error for invalid filter columns (SQL injection protection)', async () => {
    // Using a column name that doesn't exist in schema
    await expect(
      adapter.list({ where: { invalidColumn: 'value' } })
    ).rejects.toThrow('Invalid filter column');
  });

  it('should throw error when using SQL injection in filter values', async () => {
    // This tests that even if the column is valid, malicious values are handled
    await adapter.create({ name: 'Test User', email: 'test@example.com' });

    // The adapter uses parameterized queries, so SQL injection in values is prevented
    const result = await adapter.list({ where: { name: "'; DROP TABLE users; --" } as Record<string, unknown> });

    // Should return empty because it looks for exact match
    expect(result.data).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 10. Test error handling — invalid schema, missing fields
  // ---------------------------------------------------------------------------

  it('should handle missing required fields on create', async () => {
    // The 'name' field is required (not nullable, no default)
    await expect(
      adapter.create({ email: 'test@example.com' } as Record<string, unknown>)
    ).rejects.toThrow();
  });

  it('should handle boolean conversion correctly', async () => {
    const created = await adapter.create({ 
      name: 'Bool Test', 
      email: 'bool@example.com',
      active: true 
    });

    expect(created.active).toBe(true);
    expect(typeof created.active).toBe('boolean');

    const retrieved = await adapter.get(created.id as string);
    expect(retrieved?.active).toBe(true);
  });

  it('should handle default values correctly', async () => {
    const created = await adapter.create({ 
      name: 'Defaults Test', 
      email: 'defaults@example.com'
    });

    expect(created.active).toBe(true);
    expect(created.role).toBe('user');
  });
});
