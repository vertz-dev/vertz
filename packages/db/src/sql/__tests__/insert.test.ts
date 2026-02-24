import { describe, expect, it } from 'bun:test';
import { buildInsert } from '../insert';

describe('buildInsert', () => {
  describe('single row insert', () => {
    it('generates INSERT with parameterized values', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', email: 'alice@example.com' },
      });
      expect(result.sql).toBe('INSERT INTO "users" ("name", "email") VALUES ($1, $2)');
      expect(result.params).toEqual(['alice', 'alice@example.com']);
    });

    it('converts camelCase keys to snake_case columns', () => {
      const result = buildInsert({
        table: 'users',
        data: { firstName: 'alice', lastName: 'smith' },
      });
      expect(result.sql).toBe('INSERT INTO "users" ("first_name", "last_name") VALUES ($1, $2)');
      expect(result.params).toEqual(['alice', 'smith']);
    });

    it('handles single column insert', () => {
      const result = buildInsert({
        table: 'tags',
        data: { name: 'typescript' },
      });
      expect(result.sql).toBe('INSERT INTO "tags" ("name") VALUES ($1)');
      expect(result.params).toEqual(['typescript']);
    });

    it('handles null values', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', bio: null },
      });
      expect(result.sql).toBe('INSERT INTO "users" ("name", "bio") VALUES ($1, $2)');
      expect(result.params).toEqual(['alice', null]);
    });
  });

  describe('RETURNING clause', () => {
    it('generates RETURNING *', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice' },
        returning: '*',
      });
      expect(result.sql).toBe('INSERT INTO "users" ("name") VALUES ($1) RETURNING *');
      expect(result.params).toEqual(['alice']);
    });

    it('generates RETURNING with specific columns', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice' },
        returning: ['id', 'createdAt'],
      });
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name") VALUES ($1) RETURNING "id", "created_at" AS "createdAt"',
      );
    });
  });

  describe('batch insert', () => {
    it('generates multi-row VALUES clause', () => {
      const result = buildInsert({
        table: 'users',
        data: [
          { name: 'alice', email: 'alice@test.com' },
          { name: 'bob', email: 'bob@test.com' },
        ],
      });
      expect(result.sql).toBe('INSERT INTO "users" ("name", "email") VALUES ($1, $2), ($3, $4)');
      expect(result.params).toEqual(['alice', 'alice@test.com', 'bob', 'bob@test.com']);
    });

    it('handles three rows', () => {
      const result = buildInsert({
        table: 'tags',
        data: [{ name: 'ts' }, { name: 'js' }, { name: 'go' }],
      });
      expect(result.sql).toBe('INSERT INTO "tags" ("name") VALUES ($1), ($2), ($3)');
      expect(result.params).toEqual(['ts', 'js', 'go']);
    });

    it('batch insert with RETURNING', () => {
      const result = buildInsert({
        table: 'users',
        data: [{ name: 'alice' }, { name: 'bob' }],
        returning: '*',
      });
      expect(result.sql).toBe('INSERT INTO "users" ("name") VALUES ($1), ($2) RETURNING *');
    });

    it('uses keys from first row for column order', () => {
      const result = buildInsert({
        table: 'users',
        data: [
          { name: 'alice', email: 'a@t.com' },
          { email: 'b@t.com', name: 'bob' },
        ],
      });
      // Column order should follow the first row's keys
      expect(result.sql).toBe('INSERT INTO "users" ("name", "email") VALUES ($1, $2), ($3, $4)');
      expect(result.params).toEqual(['alice', 'a@t.com', 'bob', 'b@t.com']);
    });
  });

  describe('ON CONFLICT (upsert)', () => {
    it('generates ON CONFLICT DO NOTHING', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', email: 'alice@test.com' },
        onConflict: {
          columns: ['email'],
          action: 'nothing',
        },
      });
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO NOTHING',
      );
    });

    it('generates ON CONFLICT DO UPDATE SET', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', email: 'alice@test.com' },
        onConflict: {
          columns: ['email'],
          action: 'update',
          updateColumns: ['name'],
        },
      });
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"',
      );
    });

    it('generates upsert with multiple conflict columns', () => {
      const result = buildInsert({
        table: 'user_roles',
        data: { userId: 'u1', roleId: 'r1', active: true },
        onConflict: {
          columns: ['userId', 'roleId'],
          action: 'update',
          updateColumns: ['active'],
        },
      });
      expect(result.sql).toBe(
        'INSERT INTO "user_roles" ("user_id", "role_id", "active") VALUES ($1, $2, $3) ON CONFLICT ("user_id", "role_id") DO UPDATE SET "active" = EXCLUDED."active"',
      );
    });

    it('generates upsert with multiple update columns', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', email: 'alice@test.com', bio: 'Hello' },
        onConflict: {
          columns: ['email'],
          action: 'update',
          updateColumns: ['name', 'bio'],
        },
      });
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name", "email", "bio") VALUES ($1, $2, $3) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name", "bio" = EXCLUDED."bio"',
      );
    });

    it('generates upsert with RETURNING', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', email: 'alice@test.com' },
        onConflict: {
          columns: ['email'],
          action: 'update',
          updateColumns: ['name'],
        },
        returning: '*',
      });
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name" RETURNING *',
      );
    });
  });

  describe('default("now") sentinel handling', () => {
    it('converts "now" sentinel to NOW() for timestamp columns', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', createdAt: 'now' },
        nowColumns: ['createdAt'],
      });
      expect(result.sql).toBe('INSERT INTO "users" ("name", "created_at") VALUES ($1, NOW())');
      expect(result.params).toEqual(['alice']);
    });

    it('handles multiple now columns', () => {
      const result = buildInsert({
        table: 'users',
        data: { name: 'alice', createdAt: 'now', updatedAt: 'now' },
        nowColumns: ['createdAt', 'updatedAt'],
      });
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name", "created_at", "updated_at") VALUES ($1, NOW(), NOW())',
      );
      expect(result.params).toEqual(['alice']);
    });
  });
});
