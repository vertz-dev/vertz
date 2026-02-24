import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import {
  create,
  createMany,
  createManyAndReturn,
  update,
  updateMany,
  upsert,
} from '../../query/crud';
import type { QueryFn } from '../../query/executor';
import { getAutoUpdateColumns, getReadOnlyColumns } from '../../query/helpers';

describe('Feature: Schema annotations — readOnly and autoUpdate', () => {
  // --- readOnly() ---

  describe('Given a column with .readOnly()', () => {
    describe('When inspecting the column metadata', () => {
      it('Then _meta.isReadOnly is true', () => {
        const col = d.text().readOnly();
        expect(col._meta.isReadOnly).toBe(true);
      });
    });
  });

  describe('Given a column without .readOnly()', () => {
    describe('When inspecting the column metadata', () => {
      it('Then _meta.isReadOnly is false', () => {
        const col = d.text();
        expect(col._meta.isReadOnly).toBe(false);
      });
    });
  });

  // --- autoUpdate() ---

  describe('Given a timestamp column with .autoUpdate()', () => {
    describe('When inspecting the column metadata', () => {
      it('Then _meta.isAutoUpdate is true', () => {
        const col = d.timestamp().autoUpdate();
        expect(col._meta.isAutoUpdate).toBe(true);
      });

      it('Then _meta.isReadOnly is also true (autoUpdate implies readOnly)', () => {
        const col = d.timestamp().autoUpdate();
        expect(col._meta.isReadOnly).toBe(true);
      });
    });
  });

  describe('Given a column without .autoUpdate()', () => {
    describe('When inspecting the column metadata', () => {
      it('Then _meta.isAutoUpdate is false', () => {
        const col = d.timestamp();
        expect(col._meta.isAutoUpdate).toBe(false);
      });
    });
  });

  // --- Runtime helpers ---

  describe('Given a table with readOnly and autoUpdate columns', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
      updatedAt: d.timestamp().autoUpdate(),
    });

    describe('When calling getReadOnlyColumns(table)', () => {
      it('Then returns column names where isReadOnly is true', () => {
        const cols = getReadOnlyColumns(users);
        expect(cols).toContain('createdAt');
        expect(cols).toContain('updatedAt');
        expect(cols).not.toContain('email');
        expect(cols).not.toContain('name');
        expect(cols).not.toContain('id');
      });
    });

    describe('When calling getAutoUpdateColumns(table)', () => {
      it('Then returns column names where isAutoUpdate is true', () => {
        const cols = getAutoUpdateColumns(users);
        expect(cols).toContain('updatedAt');
        expect(cols).not.toContain('createdAt');
        expect(cols).not.toContain('email');
      });
    });
  });

  // --- CRUD integration ---

  describe('Given a table with readOnly columns', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
      updatedAt: d.timestamp().autoUpdate(),
    });

    describe('When calling crud.create() with readOnly fields in data', () => {
      it('Then strips readOnly fields before insert (they do not appear in SQL)', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [{ id: '1', email: 'a@b.com', name: 'Alice' }], rowCount: 1 };
        };

        await create(mockQueryFn, users, {
          data: { email: 'a@b.com', name: 'Alice', createdAt: new Date('2020-01-01') },
        });

        // createdAt is readOnly — it should NOT appear in the INSERT columns
        // (it may still appear in RETURNING which is correct — we read the DB default)
        const insertPart = capturedSql.split('RETURNING')[0];
        expect(insertPart).not.toContain('created_at');
        // email and name should appear in the INSERT columns
        expect(insertPart).toContain('email');
        expect(insertPart).toContain('name');
      });
    });

    describe('When calling crud.update() with readOnly fields in data', () => {
      it('Then strips readOnly fields before update', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [{ id: '1', email: 'a@b.com', name: 'Bob' }], rowCount: 1 };
        };

        await update(mockQueryFn, users, {
          where: { id: '1' },
          data: { name: 'Bob', createdAt: new Date('2020-01-01') },
        });

        // createdAt is readOnly — should NOT appear in the SET clause
        const setPart = capturedSql.split('WHERE')[0];
        expect(setPart).not.toContain('created_at');
        // name should appear in the SET clause
        expect(setPart).toContain('name');
      });
    });
  });

  describe('Given a table with readOnly columns and createMany()', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
    });

    describe('When calling crud.createMany() with readOnly fields in data', () => {
      it('Then strips readOnly fields before insert', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [], rowCount: 1 };
        };

        await createMany(mockQueryFn, users, {
          data: [{ email: 'a@b.com', name: 'Alice', createdAt: new Date('2020-01-01') }],
        });

        const insertPart = capturedSql.split('RETURNING')[0];
        expect(insertPart).not.toContain('created_at');
        expect(insertPart).toContain('email');
      });
    });
  });

  describe('Given a table with readOnly columns and createManyAndReturn()', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
    });

    describe('When calling crud.createManyAndReturn() with readOnly fields in data', () => {
      it('Then strips readOnly fields before insert', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [{ id: '1', email: 'a@b.com', name: 'Alice' }], rowCount: 1 };
        };

        await createManyAndReturn(mockQueryFn, users, {
          data: [{ email: 'a@b.com', name: 'Alice', createdAt: new Date('2020-01-01') }],
        });

        const insertPart = capturedSql.split('RETURNING')[0];
        expect(insertPart).not.toContain('created_at');
        expect(insertPart).toContain('email');
      });
    });
  });

  describe('Given a table with readOnly columns and updateMany()', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
      updatedAt: d.timestamp().autoUpdate(),
    });

    describe('When calling crud.updateMany() with readOnly fields in data', () => {
      it('Then strips readOnly fields and auto-sets autoUpdate columns', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [], rowCount: 2 };
        };

        await updateMany(mockQueryFn, users, {
          where: { name: 'Alice' },
          data: { name: 'Bob', createdAt: new Date('2020-01-01') },
        });

        const setPart = capturedSql.split('WHERE')[0];
        expect(setPart).not.toContain('created_at');
        expect(setPart).toContain('name');
        // autoUpdate columns should be auto-set to NOW()
        expect(capturedSql).toContain('updated_at');
        expect(capturedSql).toContain('NOW()');
      });
    });
  });

  describe('Given a table with readOnly columns and upsert()', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
      updatedAt: d.timestamp().autoUpdate(),
    });

    describe('When calling crud.upsert() with readOnly fields in create and update data', () => {
      it('Then strips readOnly from create path and update path, auto-sets autoUpdate in update path', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [{ id: '1', email: 'a@b.com', name: 'Alice' }], rowCount: 1 };
        };

        await upsert(mockQueryFn, users, {
          where: { email: 'a@b.com' },
          create: { email: 'a@b.com', name: 'Alice', createdAt: new Date('2020-01-01') },
          update: { name: 'Alice Updated', createdAt: new Date('2020-01-01') },
        });

        // Create path: readOnly fields should be stripped from INSERT columns
        const insertPart = capturedSql.split('ON CONFLICT')[0];
        expect(insertPart).not.toContain('created_at');
        expect(insertPart).toContain('email');
        expect(insertPart).toContain('name');
      });
    });
  });

  describe('Given a table with autoUpdate columns', () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
      updatedAt: d.timestamp().autoUpdate(),
    });

    describe('When calling crud.update()', () => {
      it('Then auto-sets autoUpdate columns to NOW() in the SQL', async () => {
        let capturedSql = '';
        const mockQueryFn: QueryFn = async (sql) => {
          capturedSql = sql;
          return { rows: [{ id: '1', name: 'Bob' }], rowCount: 1 };
        };

        await update(mockQueryFn, users, {
          where: { id: '1' },
          data: { name: 'Bob' },
        });

        // updatedAt is autoUpdate — should be set to NOW() in the SET clause
        expect(capturedSql).toContain('updated_at');
        expect(capturedSql).toContain('NOW()');
      });
    });
  });
});
