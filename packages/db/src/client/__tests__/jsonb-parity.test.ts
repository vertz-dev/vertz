import { describe, expect, it } from '@vertz/test';
import { d } from '../../d';
import { JsonbParseError, JsonbValidationError } from '../../errors';
import { createDb } from '../database';
import { createSqliteDriver, type TableSchemaRegistry } from '../sqlite-driver';

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'cuid' }),
  tenantId: d.uuid(),
  meta: d.jsonb<{ displayName: string }>(),
});
const installModel = d.model(installTable);

describe('Feature: d.jsonb<T>() SQLite parity', () => {
  describe('Given an install table with meta: d.jsonb<{ displayName: string }>()', () => {
    describe('When writing and reading back on local SQLite', () => {
      it('Then the returned value is a parsed object, not a JSON string', async () => {
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { install: installModel },
          migrations: { autoApply: true },
        });
        const created = await db.install.create({
          data: { tenantId: '019da74e-0000-0000-0000-000000000001', meta: { displayName: 'Acme' } },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new TypeError('create failed');
        const listed = await db.install.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(1);
        const row = listed.data[0]!;
        expect(typeof row.meta).toBe('object');
        expect(row.meta).toEqual({ displayName: 'Acme' });
      });

      it('Then arrays round-trip as arrays', async () => {
        const tagsTable = d.table('taglist', {
          id: d.uuid().primary({ generate: 'cuid' }),
          tags: d.jsonb<string[]>(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { taglist: d.model(tagsTable) },
          migrations: { autoApply: true },
        });
        const created = await db.taglist.create({ data: { tags: ['urgent', 'review'] } });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new TypeError('create failed');
        const listed = await db.taglist.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.tags).toEqual(['urgent', 'review']);
      });

      it('Then null values pass through as null', async () => {
        const optTable = d.table('opt', {
          id: d.uuid().primary({ generate: 'cuid' }),
          meta: d.jsonb<{ k: string }>().nullable(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { opt: d.model(optTable) },
          migrations: { autoApply: true },
        });
        const created = await db.opt.create({ data: { meta: null } });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new TypeError('create failed');
        const listed = await db.opt.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.meta).toBe(null);
      });
    });

    describe('When a jsonb TEXT cell contains malformed JSON', () => {
      it('Then a read surfaces JsonbParseError with table + column context', async () => {
        mockD1AllReturns({ results: [{ id: 'x', meta: 'not-json' }] }, async (mock) => {
          const schema: TableSchemaRegistry = new Map([
            ['install', { id: 'text', meta: 'jsonb' }],
          ]);
          const driver = createSqliteDriver(mock.d1, schema);
          let err: unknown;
          try {
            await driver.query('SELECT * FROM install');
          } catch (e) {
            err = e;
          }
          expect(err).toBeInstanceOf(JsonbParseError);
          const typed = err as JsonbParseError;
          expect(typed.table).toBe('install');
          expect(typed.column).toBe('meta');
          expect(typed.columnType).toBe('jsonb');
        });
      });
    });

    describe('When a validator is attached to a jsonb column', () => {
      it('Then the validator runs on the parsed value on reads', async () => {
        const calls: unknown[] = [];
        mockD1AllReturns(
          { results: [{ id: 'x', meta: '{"displayName":"Acme"}' }] },
          async (mock) => {
            const schema: TableSchemaRegistry = new Map([
              [
                'install',
                {
                  id: 'text',
                  meta: {
                    sqlType: 'jsonb',
                    validator: {
                      parse: (v) => {
                        calls.push(v);
                        return v;
                      },
                    },
                  },
                },
              ],
            ]);
            const driver = createSqliteDriver(mock.d1, schema);
            await driver.query('SELECT * FROM install');
            expect(calls).toEqual([{ displayName: 'Acme' }]);
          },
        );
      });

      it('Then a failing validator surfaces JsonbValidationError', async () => {
        mockD1AllReturns({ results: [{ id: 'x', meta: '{"bad":true}' }] }, async (mock) => {
          const schema: TableSchemaRegistry = new Map([
            [
              'install',
              {
                id: 'text',
                meta: {
                  sqlType: 'jsonb',
                  validator: {
                    parse: () => {
                      throw new TypeError('expected displayName');
                    },
                  },
                },
              },
            ],
          ]);
          const driver = createSqliteDriver(mock.d1, schema);
          let err: unknown;
          try {
            await driver.query('SELECT * FROM install');
          } catch (e) {
            err = e;
          }
          expect(err).toBeInstanceOf(JsonbValidationError);
          const typed = err as JsonbValidationError;
          expect(typed.table).toBe('install');
          expect(typed.column).toBe('meta');
          expect(typed.value).toEqual({ bad: true });
        });
      });
    });

    describe('When an object is written via `as any` into a plain TEXT column', () => {
      it('Then the object is stringified on write and returned as a raw string on read (escape-hatch behavior)', async () => {
        const loggyTable = d.table('loggy', {
          id: d.uuid().primary({ generate: 'cuid' }),
          payload: d.text(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { loggy: d.model(loggyTable) },
          migrations: { autoApply: true },
        });
        const created = await db.loggy.create({
          data: {
            // @ts-expect-error — intentionally force an object into a TEXT column
            // to exercise the documented escape-hatch behavior (stringify on write,
            // raw string on read because the column type is not jsonb).
            payload: { a: 1 },
          },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new TypeError('create failed');
        const listed = await db.loggy.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.payload).toBe('{"a":1}');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockPrepared {
  bind(...values: unknown[]): MockPrepared;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

interface MockD1 {
  prepare(sql: string): MockPrepared;
}

/**
 * Run a block with a mock D1 whose `.all()` returns the given result.
 */
async function mockD1AllReturns(
  result: { results: unknown[] },
  block: (h: { readonly d1: MockD1 }) => Promise<void>,
): Promise<void> {
  const prepared: MockPrepared = {
    bind(): MockPrepared {
      return prepared;
    },
    async all() {
      return result;
    },
    async run() {
      return { meta: { changes: 0 } };
    },
  };
  const d1: MockD1 = {
    prepare(): MockPrepared {
      return prepared;
    },
  };
  await block({ d1 });
}
