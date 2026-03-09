import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import type { D1Database } from '@vertz/db';
import { createDb } from '@vertz/db';
import { authModels } from '../auth-models';
import { validateAuthModels } from '../auth-tables';

describe('validateAuthModels', () => {
  function createMockD1(): D1Database {
    const rawDb = new Database(':memory:');
    return {
      prepare: (sqlStr: string) => {
        const stmt = rawDb.prepare(sqlStr);
        return {
          bind() {
            return this;
          },
          async all() {
            return { results: [], success: true };
          },
          async run() {
            return { results: [], success: true, meta: { changes: 0 } };
          },
          async first() {
            return null;
          },
        };
      },
    } as unknown as D1Database;
  }

  it('throws when auth models are missing from db', () => {
    const db = createDb({
      models: {},
      dialect: 'sqlite',
      d1: createMockD1(),
    });

    expect(() => validateAuthModels(db)).toThrow(/Auth requires models/);
  });

  it('lists missing model names in error message', () => {
    const db = createDb({
      models: {},
      dialect: 'sqlite',
      d1: createMockD1(),
    });

    expect(() => validateAuthModels(db)).toThrow(/auth_users/);
    expect(() => validateAuthModels(db)).toThrow(/authModels/);
  });

  it('does not throw when all auth models are present', () => {
    const db = createDb({
      models: { ...authModels },
      dialect: 'sqlite',
      d1: createMockD1(),
    });

    expect(() => validateAuthModels(db)).not.toThrow();
  });

  it('throws when only some auth models are present', () => {
    const db = createDb({
      models: { auth_users: authModels.auth_users },
      dialect: 'sqlite',
      d1: createMockD1(),
    });

    expect(() => validateAuthModels(db)).toThrow(/Auth requires models/);
    expect(() => validateAuthModels(db)).toThrow(/auth_sessions/);
  });
});
