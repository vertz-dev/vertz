/**
 * Integration tests for SQLite dialect using D1 mock.
 *
 * These tests verify that the SQLite dialect works end-to-end using a mock D1
 * binding, ensuring value conversion (boolean 0/1 <-> true/false, ISO string <-> Date)
 * works correctly.
 */

import { unwrap } from '@vertz/schema';
import { describe, expect, it, mock } from 'bun:test';
import { createDb } from '../client/database';
import type { D1Database, D1PreparedStatement } from '../client/sqlite-driver';
import { d } from '../d';

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
});

const models = { users: d.model(users) };

describe('SQLite integration (via D1 mock)', () => {
  /**
   * Creates a mock D1 database that simulates SQLite behavior.
   */
  function createMockD1(): D1Database {
    return {
      prepare: mock((sql: string) => {
        const stmt: D1PreparedStatement = {
          bind: mock(function (this: D1PreparedStatement, ..._values: unknown[]) {
            return this;
          }),
          all: mock(async () => {
            // Return mock results for SELECT
            return {
              results: [
                {
                  id: 'test-uuid-123',
                  name: 'Alice',
                  active: 1, // SQLite stores boolean as INTEGER
                  createdAt: '2024-01-15T10:30:00.000Z',
                },
              ],
              success: true,
            };
          }),
          run: mock(async () => {
            // Return mock results for INSERT with RETURNING
            return {
              results: [
                {
                  id: 'test-uuid-123',
                  name: 'Alice',
                  active: 1,
                  createdAt: '2024-01-15T10:30:00.000Z',
                },
              ],
              success: true,
              meta: { changes: 1 },
            };
          }),
          first: mock(async () => null),
        };
        return stmt;
      }),
    } as unknown as D1Database;
  }

  it('SQLite CRUD: create inserts a record via D1 mock', async () => {
    const mockD1 = createMockD1();

    const db = createDb({
      dialect: 'sqlite',
      d1: mockD1,
      models,
    });

    const created = unwrap(
      await db.create('users', {
        data: { id: 'test-uuid-123', name: 'Alice', active: true, createdAt: 'now' },
      }),
    );

    expect(created.id).toBe('test-uuid-123');
    expect(created.name).toBe('Alice');
    // Value conversion: SQLite returned 1, JS gets true
    expect(created.active).toBe(true);
    // Value conversion: SQLite returned ISO string, JS gets Date
    expect(created.createdAt).toBeInstanceOf(Date);

    // Verify mock D1 was called with ? params (SQLite)
    const prepareMock = mockD1.prepare as ReturnType<typeof mock>;
    expect(prepareMock).toHaveBeenCalled();
    const callArg = prepareMock.mock.calls[0][0] as string;
    expect(callArg).toContain('?');
  });

  it('SQLite CRUD: list retrieves records via D1 mock with value conversion', async () => {
    const mockD1 = createMockD1();

    const db = createDb({
      dialect: 'sqlite',
      d1: mockD1,
      models,
    });

    const result = unwrap(await db.list('users'));

    expect(result).toHaveLength(1);

    expect(result[0].id).toBe('test-uuid-123');
    expect(result[0].name).toBe('Alice');
    // Value conversion: SQLite returned 1, JS gets true
    expect(result[0].active).toBe(true);
    // Value conversion: SQLite returned ISO string, JS gets Date
    expect(result[0].createdAt).toBeInstanceOf(Date);
  });
});
