import { describe, expect, it } from '@vertz/test';
import { createDb } from '../../client/database';
import { d } from '../../d';
import type { JsonbValidator } from '../../schema/column';

type Meta = { displayName: string; tier: 'free' | 'pro' };

const strictValidator: JsonbValidator<Meta> = {
  parse(v) {
    const obj = v as { displayName?: unknown; tier?: unknown };
    if (typeof obj !== 'object' || obj === null || typeof obj.displayName !== 'string') {
      throw new TypeError('missing displayName');
    }
    return {
      displayName: obj.displayName,
      tier: obj.tier === 'pro' ? 'pro' : 'free',
    };
  },
};

function freshDb() {
  const installTable = d.table('install', {
    id: d.uuid().primary({ generate: 'cuid' }),
    tenantId: d.uuid(),
    meta: d.jsonb<Meta>({ validator: strictValidator }),
  });
  const db = createDb({
    dialect: 'sqlite',
    path: ':memory:',
    models: { install: d.model(installTable) },
    migrations: { autoApply: true },
  });
  return db;
}

describe('Feature: d.jsonb validator on writes', () => {
  describe('Given a meta column with a throwing validator', () => {
    describe('When create() is called with an invalid payload', () => {
      it('Then returns { ok: false, error.code: "JSONB_VALIDATION_ERROR" } without reaching the driver', async () => {
        const db = freshDb();
        const res = await db.install.create({
          data: {
            tenantId: '019da74e-0000-0000-0000-000000000001',
            meta: { wrong: true } as unknown as Meta,
          },
        });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');
        const typed = res.error as { table?: string; column?: string; value?: unknown };
        expect(typed.table).toBe('install');
        expect(typed.column).toBe('meta');
        expect(typed.value).toEqual({ wrong: true });

        const listed = await db.install.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(0);
      });
    });

    describe('When create() is called with a valid payload', () => {
      it('Then the validator output (not the caller input) is persisted', async () => {
        const db = freshDb();
        const res = await db.install.create({
          data: {
            tenantId: '019da74e-0000-0000-0000-000000000002',
            // Caller input: tier is absent — validator fills it with 'free'.
            meta: { displayName: 'Acme' } as Meta,
          },
        });
        expect(res.ok).toBe(true);
        if (!res.ok) throw new TypeError('expected success');
        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.meta).toEqual({ displayName: 'Acme', tier: 'free' });
      });
    });

    describe('When createMany has one invalid row in a batch of 10', () => {
      it('Then the whole batch aborts and zero rows persist', async () => {
        const db = freshDb();
        const rows = Array.from({ length: 10 }, (_, i) => ({
          tenantId: '019da74e-0000-0000-0000-00000000000' + i,
          meta:
            i === 3
              ? ({ broken: true } as unknown as Meta)
              : ({ displayName: `user-${i}` } as Meta),
        }));
        const res = await db.install.createMany({ data: rows });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');
        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(0);
      });
    });

    describe('When createManyAndReturn has an invalid row', () => {
      it('Then the whole batch aborts and zero rows persist', async () => {
        const db = freshDb();
        const rows = [
          { tenantId: '019da74e-0000-0000-0000-00000000a001', meta: { displayName: 'a' } as Meta },
          {
            tenantId: '019da74e-0000-0000-0000-00000000a002',
            meta: { bad: 1 } as unknown as Meta,
          },
        ];
        const res = await db.install.createManyAndReturn({ data: rows });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');
        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(0);
      });
    });

    describe('When update() is called with an invalid meta', () => {
      it('Then returns JSONB_VALIDATION_ERROR and the row is unchanged', async () => {
        const db = freshDb();
        const created = await db.install.create({
          data: {
            tenantId: '019da74e-0000-0000-0000-00000000b001',
            meta: { displayName: 'Before' } as Meta,
          },
        });
        if (!created.ok) throw new TypeError('create failed');

        const res = await db.install.update({
          where: { id: created.data.id },
          data: { meta: { broken: true } as unknown as Meta },
        });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');

        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.meta).toEqual({ displayName: 'Before', tier: 'free' });
      });
    });

    describe('When update() changes a different field only', () => {
      it('Then the validator is NOT invoked on the write side (raw input never reaches it)', async () => {
        const seenRawInputs: unknown[] = [];
        // A raw caller input lacks `tier`; a validator-produced value has it.
        // Track only the raw-input calls to distinguish write-side vs read-side (RETURNING).
        const shapedValidator: JsonbValidator<Meta> = {
          parse(v) {
            const obj = v as { tier?: unknown };
            if (!(obj !== null && typeof obj === 'object' && 'tier' in obj)) {
              seenRawInputs.push(v);
            }
            return strictValidator.parse(v);
          },
        };
        const countedTable = d.table('counted', {
          id: d.uuid().primary({ generate: 'cuid' }),
          tenantId: d.uuid(),
          meta: d.jsonb<Meta>({ validator: shapedValidator }),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { counted: d.model(countedTable) },
          migrations: { autoApply: true },
        });
        const created = await db.counted.create({
          data: {
            tenantId: '019da74e-0000-0000-0000-00000000c001',
            meta: { displayName: 'Start' } as Meta,
          },
        });
        if (!created.ok) throw new TypeError('create failed');
        expect(seenRawInputs).toHaveLength(1); // 1 write-side call from create
        seenRawInputs.length = 0;

        const upd = await db.counted.update({
          where: { id: created.data.id },
          data: { tenantId: '019da74e-0000-0000-0000-00000000c002' },
        });
        expect(upd.ok).toBe(true);
        // Validator must NOT see any raw input on the write side — meta wasn't in `data`.
        expect(seenRawInputs).toHaveLength(0);
      });
    });

    describe('When updateMany() is called with an invalid meta', () => {
      it('Then returns JSONB_VALIDATION_ERROR and no rows are updated', async () => {
        const db = freshDb();
        const created = await db.install.create({
          data: {
            tenantId: '019da74e-0000-0000-0000-00000000d001',
            meta: { displayName: 'BeforeMany' } as Meta,
          },
        });
        if (!created.ok) throw new TypeError('create failed');

        const res = await db.install.updateMany({
          where: { tenantId: '019da74e-0000-0000-0000-00000000d001' },
          data: { meta: { nope: 1 } as unknown as Meta },
        });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');

        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.meta).toEqual({ displayName: 'BeforeMany', tier: 'free' });
      });
    });

    describe('When upsert() create branch receives an invalid meta', () => {
      it('Then returns JSONB_VALIDATION_ERROR without inserting', async () => {
        const db = freshDb();
        const res = await db.install.upsert({
          where: { tenantId: '019da74e-0000-0000-0000-00000000e001' },
          create: {
            tenantId: '019da74e-0000-0000-0000-00000000e001',
            meta: { bad: true } as unknown as Meta,
          },
          update: { meta: { displayName: 'ignored' } as Meta },
        });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');
        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(0);
      });
    });

    describe('When upsert() update branch receives an invalid meta', () => {
      it('Then returns JSONB_VALIDATION_ERROR without touching the row', async () => {
        const db = freshDb();
        const tenantId = '019da74e-0000-0000-0000-00000000f001';
        const created = await db.install.create({
          data: { tenantId, meta: { displayName: 'Original' } as Meta },
        });
        if (!created.ok) throw new TypeError('create failed');

        const res = await db.install.upsert({
          where: { tenantId },
          create: { tenantId, meta: { displayName: 'NewCreate' } as Meta },
          update: { meta: { broken: true } as unknown as Meta },
        });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');

        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.meta).toEqual({ displayName: 'Original', tier: 'free' });
      });
    });

    describe('When update() triggers autoUpdate timestamp columns only', () => {
      it('Then the validator is NOT invoked on the write side (autoUpdate `now` sentinel bypasses jsonb cols)', async () => {
        const seenRawInputs: unknown[] = [];
        const shapedValidator: JsonbValidator<Meta> = {
          parse(v) {
            const obj = v as { tier?: unknown };
            if (!(obj !== null && typeof obj === 'object' && 'tier' in obj)) {
              seenRawInputs.push(v);
            }
            return strictValidator.parse(v);
          },
        };
        const trackTable = d.table('track', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
          meta: d.jsonb<Meta>({ validator: shapedValidator }),
          updatedAt: d.timestamp().autoUpdate(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { track: d.model(trackTable) },
          migrations: { autoApply: true },
        });
        const created = await db.track.create({
          data: { name: 'orig', meta: { displayName: 'Track' } as Meta },
        });
        if (!created.ok) throw new TypeError('create failed');
        seenRawInputs.length = 0;

        // Update only `name`: autoUpdate timestamp fires on the DB side via the
        // 'now' sentinel in SQL — but the write-side validator must NOT see
        // that 'now' sentinel (timestamp col has no validator), and must NOT
        // see any raw jsonb input (meta not in data).
        const upd = await db.track.update({
          where: { id: created.data.id },
          data: { name: 'updated' },
        });
        expect(upd.ok).toBe(true);
        expect(seenRawInputs).toHaveLength(0);
      });
    });

    describe("When the jsonb payload is the literal string 'now'", () => {
      it('Then the validator IS invoked on it (regression guard for the removed `now` skip)', async () => {
        let seen: unknown = 'not-called';
        const stringValidator: JsonbValidator<string> = {
          parse(v) {
            seen = v;
            if (typeof v !== 'string') throw new TypeError('expected string');
            return v;
          },
        };
        const stringTable = d.table('str', {
          id: d.uuid().primary({ generate: 'cuid' }),
          note: d.jsonb<string>({ validator: stringValidator }),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { str: d.model(stringTable) },
          migrations: { autoApply: true },
        });
        // Bare-string-into-jsonb round-trip has a separate storage quirk
        // (driver stores the raw 4-char text, then `JSON.parse('now')` fails
        // on read). The *only* assertion here is that the write-side validator
        // was invoked on the literal string 'now' — no `value === 'now'` skip.
        await db.str.create({ data: { note: 'now' } });
        expect(seen).toBe('now');
      });
    });
  });

  describe('Given a table with no validator on any column (fast path)', () => {
    describe('When createMany runs with 100 rows', () => {
      it('Then all 100 rows persist without error', async () => {
        const plainTable = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { plain: d.model(plainTable) },
          migrations: { autoApply: true },
        });
        const rows = Array.from({ length: 100 }, (_, i) => ({ name: `r${i}` }));
        const res = await db.plain.createMany({ data: rows });
        expect(res.ok).toBe(true);
        // Note: SQLite's INSERT-without-RETURNING path doesn't surface a
        // driver-level rowCount today (separate issue from this ticket), so we
        // verify persistence via list() rather than `res.data.count`.
        const listed = await db.plain.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(100);
      });
    });
  });
});
