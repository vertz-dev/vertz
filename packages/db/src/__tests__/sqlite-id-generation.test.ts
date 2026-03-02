/**
 * Tests that the SQLite/D1 adapter (BaseSqlAdapter) generates UUIDv7 IDs,
 * not UUIDv4. This is a regression test for a bug where sql-utils.ts used
 * crypto.randomUUID() (v4) instead of generateId('uuid') (v7).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteAdapter } from '../adapters/sqlite-adapter';
import { d } from '../d';
import type { EntityDbAdapter } from '../types/adapter';

const todosTable = d.table('todos', {
  id: d.text().primary({ generate: 'uuid' }),
  title: d.text(),
});

let tmpDir: string;
let adapter: EntityDbAdapter;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `vertz-sqlite-id-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  adapter = await createSqliteAdapter({
    schema: todosTable,
    dbPath: join(tmpDir, 'test.db'),
    migrations: { autoApply: true },
  });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SQLite adapter ID generation', () => {
  it('generates UUIDv7 (not v4) when creating a record', async () => {
    const result = await adapter.create({ title: 'Test todo' });
    const id = result.id as string;

    // Should be a valid UUID
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Version nibble (13th hex char, position 14 in string) must be '7' for UUIDv7
    expect(id.charAt(14)).toBe('7');
  });

  it('generates time-ordered UUIDv7 IDs across multiple creates', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await adapter.create({ title: `Todo ${i}` });
      ids.push(result.id as string);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));
    }

    // All should be UUIDv7
    for (const id of ids) {
      expect(id.charAt(14)).toBe('7');
    }

    // UUIDv7 IDs created sequentially should sort in creation order
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });
});
