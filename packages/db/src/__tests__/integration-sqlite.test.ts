/**
 * Integration tests for SQLite dialect using D1 mock.
 *
 * These tests verify that the SQLite dialect works end-to-end using a mock D1
 * binding, ensuring value conversion (boolean 0/1 <-> true/false, ISO string <-> Date)
 * works correctly.
 */

import { describe, expect, it, mock } from '@vertz/test';
import { unwrap } from '@vertz/schema';
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
      await db.users.create({
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

    const result = unwrap(await db.users.list());

    expect(result).toHaveLength(1);

    expect(result[0].id).toBe('test-uuid-123');
    expect(result[0].name).toBe('Alice');
    // Value conversion: SQLite returned 1, JS gets true
    expect(result[0].active).toBe(true);
    // Value conversion: SQLite returned ISO string, JS gets Date
    expect(result[0].createdAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // d.bytea() round-trip (issue #2843)
  // -------------------------------------------------------------------------

  const secretsTable = d.table('secrets', {
    id: d.uuid().primary(),
    dek: d.bytea(),
    nonce: d.bytea().nullable(),
  });
  const byteaModels = { secrets: d.model(secretsTable) };

  function createByteaMockD1(listRow: Record<string, unknown>): {
    d1: D1Database;
    bindCalls: unknown[][];
  } {
    const bindCalls: unknown[][] = [];
    const d1: D1Database = {
      prepare: mock(() => {
        const stmt: D1PreparedStatement = {
          bind: mock(function (this: D1PreparedStatement, ...values: unknown[]) {
            bindCalls.push(values);
            return this;
          }),
          all: mock(async () => ({
            results: [listRow],
            success: true,
          })),
          run: mock(async () => ({
            results: [listRow],
            success: true,
            meta: { changes: 1 },
          })),
          first: mock(async () => null),
        } as unknown as D1PreparedStatement;
        return stmt;
      }),
    } as unknown as D1Database;
    return { d1, bindCalls };
  }

  it('SQLite bytea: round-trips a small Uint8Array with Buffer → Uint8Array normalization', async () => {
    const stored = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
    // Simulate Node-style drivers returning a Buffer; the converter must
    // normalize it to a plain Uint8Array on read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Buffer probe
    const asBuffer = (globalThis as any).Buffer?.from(stored) ?? stored;
    const { d1, bindCalls } = createByteaMockD1({ id: 'bytea-1', dek: asBuffer, nonce: null });

    const db = createDb({ dialect: 'sqlite', d1, models: byteaModels });
    const created = unwrap(await db.secrets.create({ data: { id: 'bytea-1', dek: stored } }));
    expect(created.dek).toBeInstanceOf(Uint8Array);
    expect(Array.from(created.dek)).toEqual(Array.from(stored));

    const sawBytea = bindCalls.some((params) =>
      params.some(
        (p) => p instanceof Uint8Array && Array.from(p).join(',') === '222,173,190,239,0,255',
      ),
    );
    expect(sawBytea).toBe(true);

    const [row] = unwrap(await db.secrets.list());
    expect(row.dek).toBeInstanceOf(Uint8Array);
    expect(Object.getPrototypeOf(row.dek)).toBe(Uint8Array.prototype);
    expect(Array.from(row.dek)).toEqual(Array.from(stored));
  });

  it('SQLite bytea: empty Uint8Array(0) round-trips as zero-length buffer', async () => {
    const empty = new Uint8Array(0);
    const { d1 } = createByteaMockD1({ id: 'empty-1', dek: empty, nonce: null });

    const db = createDb({ dialect: 'sqlite', d1, models: byteaModels });
    const created = unwrap(await db.secrets.create({ data: { id: 'empty-1', dek: empty } }));
    expect(created.dek).toBeInstanceOf(Uint8Array);
    expect(created.dek.byteLength).toBe(0);
  });

  it('SQLite bytea: large (~256 KB) payload round-trips without truncation', async () => {
    const size = 256 * 1024;
    const payload = new Uint8Array(size);
    for (let i = 0; i < size; i++) payload[i] = i & 0xff;
    const { d1 } = createByteaMockD1({ id: 'big-1', dek: payload, nonce: null });

    const db = createDb({ dialect: 'sqlite', d1, models: byteaModels });
    const created = unwrap(await db.secrets.create({ data: { id: 'big-1', dek: payload } }));
    expect(created.dek.byteLength).toBe(size);
    expect(created.dek[0]).toBe(0);
    expect(created.dek[size - 1]).toBe((size - 1) & 0xff);
  });

  it('SQLite bytea: nullable column passes null through on reads', async () => {
    const { d1 } = createByteaMockD1({
      id: 'nullable-1',
      dek: new Uint8Array([1, 2, 3]),
      nonce: null,
    });
    const db = createDb({ dialect: 'sqlite', d1, models: byteaModels });
    const created = unwrap(
      await db.secrets.create({
        data: { id: 'nullable-1', dek: new Uint8Array([1, 2, 3]), nonce: null },
      }),
    );
    expect(created.nonce).toBe(null);
  });
});
