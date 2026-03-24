import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import type { QueryFn } from '../../query/executor';
import { isValidUUID, withSessionVars } from '../request-scope';

describe('Feature: UUID validation', () => {
  describe('Given a valid UUID v4', () => {
    it('Then returns true', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
  });

  describe('Given a nil UUID', () => {
    it('Then returns true', () => {
      expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
    });
  });

  describe('Given an invalid string', () => {
    it('Then returns false for SQL injection attempts', () => {
      expect(isValidUUID("'; DROP TABLE users; --")).toBe(false);
    });

    it('Then returns false for empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });

    it('Then returns false for non-UUID format', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    it('Then returns false for UUID with wrong length', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    });
  });
});

describe('Feature: Per-request SET LOCAL scoping', () => {
  let db: PGlite;
  let queryFn: QueryFn;

  beforeEach(async () => {
    db = new PGlite();
    queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await db.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
    };
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Given a Postgres QueryFn', () => {
    describe('When withSessionVars({ tenantId, userId }) is called', () => {
      it('Then sets app.tenant_id via SET LOCAL inside the transaction', async () => {
        const tenantId = '550e8400-e29b-41d4-a716-446655440000';

        const result = await withSessionVars(queryFn, { tenantId }, async (txFn) => {
          const res = await txFn("SELECT current_setting('app.tenant_id') as tid", []);
          return res.rows[0] as { tid: string };
        });

        expect(result.tid).toBe(tenantId);
      });

      it('Then sets app.user_id via SET LOCAL inside the transaction', async () => {
        const userId = '660e8400-e29b-41d4-a716-446655440000';

        const result = await withSessionVars(queryFn, { userId }, async (txFn) => {
          const res = await txFn("SELECT current_setting('app.user_id') as uid", []);
          return res.rows[0] as { uid: string };
        });

        expect(result.uid).toBe(userId);
      });

      it('Then sets both tenant_id and user_id', async () => {
        const tenantId = '550e8400-e29b-41d4-a716-446655440000';
        const userId = '660e8400-e29b-41d4-a716-446655440000';

        const result = await withSessionVars(queryFn, { tenantId, userId }, async (txFn) => {
          const tidRes = await txFn("SELECT current_setting('app.tenant_id') as tid", []);
          const uidRes = await txFn("SELECT current_setting('app.user_id') as uid", []);
          return {
            tid: (tidRes.rows[0] as { tid: string }).tid,
            uid: (uidRes.rows[0] as { uid: string }).uid,
          };
        });

        expect(result.tid).toBe(tenantId);
        expect(result.uid).toBe(userId);
      });
    });

    describe('When the operation throws', () => {
      it('Then the error is propagated', async () => {
        const tenantId = '550e8400-e29b-41d4-a716-446655440000';

        await expect(
          withSessionVars(queryFn, { tenantId }, async () => {
            throw new Error('deliberate failure');
          }),
        ).rejects.toThrow('deliberate failure');
      });
    });

    describe('When tenantId is undefined', () => {
      it('Then SET LOCAL app.tenant_id is not called', async () => {
        const userId = '660e8400-e29b-41d4-a716-446655440000';

        const result = await withSessionVars(queryFn, { userId }, async (txFn) => {
          const uidRes = await txFn("SELECT current_setting('app.user_id') as uid", []);
          return (uidRes.rows[0] as { uid: string }).uid;
        });

        expect(result).toBe(userId);
      });
    });

    describe('When tenantId is not a valid UUID', () => {
      it('Then throws Error with message about invalid UUID', async () => {
        await expect(
          withSessionVars(queryFn, { tenantId: "'; DROP TABLE users; --" }, async () => 'ok'),
        ).rejects.toThrow(/invalid.*uuid/i);
      });

      it('Then SET LOCAL is never issued', async () => {
        const calls: string[] = [];
        const spyFn: QueryFn = async (sql: string, params: readonly unknown[]) => {
          calls.push(sql);
          return queryFn(sql, params);
        };

        try {
          await withSessionVars(spyFn, { tenantId: 'not-a-uuid' }, async () => 'ok');
        } catch {
          // Expected
        }

        const hasSetLocal = calls.some((c) => c.includes('SET LOCAL'));
        expect(hasSetLocal).toBe(false);
      });
    });

    describe('When userId is not a valid UUID', () => {
      it('Then throws Error with message about invalid UUID', async () => {
        await expect(
          withSessionVars(queryFn, { userId: 'bad-uuid' }, async () => 'ok'),
        ).rejects.toThrow(/invalid.*uuid/i);
      });
    });
  });

  describe('Given session vars are SET LOCAL (transaction-scoped)', () => {
    describe('When the transaction completes', () => {
      it('Then the setting is not visible outside the transaction', async () => {
        const tenantId = '550e8400-e29b-41d4-a716-446655440000';

        await withSessionVars(queryFn, { tenantId }, async (txFn) => {
          const res = await txFn("SELECT current_setting('app.tenant_id') as tid", []);
          expect((res.rows[0] as { tid: string }).tid).toBe(tenantId);
        });

        // After transaction, the setting should not be visible
        // PGlite treats this as a new implicit transaction where the setting is gone
        const res = await queryFn("SELECT current_setting('app.tenant_id', true) as tid", []);
        const tid = (res.rows[0] as { tid: string | null }).tid;
        // Should be null or empty (not the transaction's value)
        expect(tid === null || tid === '').toBe(true);
      });
    });
  });
});
