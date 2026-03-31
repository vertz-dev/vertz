/**
 * CRUD Pipeline Tenant Edge Cases — Coverage hardening for entity/crud-pipeline.ts
 * Tests: PK fallback to 'id', multi-hop tenant traversal, missing parent FK, non-existent parent
 */

import { describe, expect, it, mock } from 'bun:test';
import { d } from '@vertz/db';
import { EntityNotFoundError, EntityValidationError, unwrap } from '@vertz/errors';
import { rules } from '../../auth/rules';
import { createEntityContext } from '../context';
import { createCrudHandlers } from '../crud-pipeline';
import { entity } from '../entity';
import { EntityRegistry } from '../entity-registry';
import type { TenantChain } from '../tenant-chain';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// Table with no .primary() — forces PK fallback to 'id'
const noPkTable = d.table('items', {
  id: d.uuid(),
  name: d.text(),
});

const noPkModel = d.model(noPkTable);

// Multi-hop tables for indirect tenant traversal
const orgsTable = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const projectsTable = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
});

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid(),
  title: d.text(),
});

const commentsTable = d.table('comments', {
  id: d.uuid().primary(),
  taskId: d.uuid(),
  body: d.text(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(
  overrides: { userId?: string | null; tenantId?: string | null; roles?: string[] } = {},
) {
  const registry = new EntityRegistry();
  return createEntityContext(
    {
      userId: 'userId' in overrides ? overrides.userId : 'user-1',
      tenantId: overrides.tenantId ?? null,
      roles: overrides.roles ?? [],
    },
    {
      key: 'test',
      registry,
    },
  );
}

function createStubDb(rows: Record<string, Record<string, unknown>> = {}) {
  return {
    get: mock(async (id: string) => rows[id] ?? null),
    list: mock(async () => ({ data: Object.values(rows), total: Object.values(rows).length })),
    create: mock(async (data: Record<string, unknown>) => ({ id: 'new-id', ...data })),
    update: mock(async (id: string, data: Record<string, unknown>) => ({
      ...rows[id],
      ...data,
    })),
    delete: mock(async (id: string) => rows[id] ?? null),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CRUD Pipeline Tenant Edge Cases', () => {
  describe('Given a table with no .primary() column metadata', () => {
    describe('When list is called and pagination computes nextCursor', () => {
      it('Then uses "id" as the PK column (line 41)', async () => {
        const rows: Record<string, Record<string, unknown>> = {
          'item-1': { id: 'item-1', name: 'First' },
          'item-2': { id: 'item-2', name: 'Second' },
        };

        const db = createStubDb(rows);
        // Override list to return exactly limit items (triggers nextCursor computation)
        db.list = mock(async () => ({
          data: [rows['item-1']!, rows['item-2']!],
          total: 5,
        }));

        const def = entity('items', {
          model: noPkModel,
          access: { list: rules.public, get: rules.public, create: rules.public },
        });

        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();
        const result = await handlers.list(ctx, { limit: 2 });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // nextCursor should be based on the 'id' column (fallback PK)
          expect(result.data.body.nextCursor).toBe('item-2');
        }
      });
    });
  });

  describe('Given a 3-level indirect tenant chain (comments → tasks → projects)', () => {
    describe('When list is called with a tenant context', () => {
      it('Then traverses multiple hops to resolve allowed parent IDs (lines 184-191)', async () => {
        const tenantChain: TenantChain = {
          hops: [
            { tableName: 'tasks', foreignKey: 'taskId', targetColumn: 'id' },
            { tableName: 'projects', foreignKey: 'projectId', targetColumn: 'id' },
          ],
          tenantColumn: 'organizationId',
        };

        const queryParentIds = mock(async (tableName: string, where: Record<string, unknown>) => {
          // Simulate: projects with org-1 = ['proj-1'], tasks in proj-1 = ['task-1', 'task-2']
          if (
            tableName === 'projects' &&
            (where as { organizationId: string }).organizationId === 'org-1'
          ) {
            return ['proj-1'];
          }
          if (tableName === 'tasks') {
            const inClause = (where as { projectId: { in: string[] } }).projectId;
            if (inClause?.in?.includes('proj-1')) {
              return ['task-1', 'task-2'];
            }
          }
          return [];
        });

        const rows: Record<string, Record<string, unknown>> = {
          'comment-1': { id: 'comment-1', taskId: 'task-1', body: 'Hello' },
        };
        const db = createStubDb(rows);
        db.list = mock(async () => ({
          data: [rows['comment-1']!],
          total: 1,
        }));

        const def = entity('comments', {
          model: d.model(commentsTable),
          access: { list: rules.public, get: rules.public, create: rules.public },
        });

        const handlers = createCrudHandlers(def, db, { tenantChain, queryParentIds });
        const ctx = makeCtx({ tenantId: 'org-1' });
        const result = await handlers.list(ctx);

        expect(result.ok).toBe(true);
        // queryParentIds should have been called twice — once for projects, once for tasks
        expect(queryParentIds).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Given an indirectly scoped entity on create', () => {
    describe('When the parent FK is missing from input', () => {
      it('Then returns EntityValidationError (missing required field)', async () => {
        const tenantChain: TenantChain = {
          hops: [{ tableName: 'projects', foreignKey: 'projectId', targetColumn: 'id' }],
          tenantColumn: 'organizationId',
        };

        const queryParentIds = mock(async () => []);

        const db = createStubDb();
        const def = entity('tasks', {
          model: d.model(tasksTable),
          access: { list: rules.public, get: rules.public, create: rules.public },
        });

        const handlers = createCrudHandlers(def, db, { tenantChain, queryParentIds });
        const ctx = makeCtx({ tenantId: 'org-1' });

        // Create without projectId — schema validation rejects missing required field
        const result = await handlers.create(ctx, { title: 'My Task' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
        }
      });
    });

    describe('When the parent does not exist', () => {
      it('Then returns EntityNotFoundError (lines 314-323)', async () => {
        const tenantChain: TenantChain = {
          hops: [{ tableName: 'projects', foreignKey: 'projectId', targetColumn: 'id' }],
          tenantColumn: 'organizationId',
        };

        // queryParentIds returns empty — parent doesn't exist
        const queryParentIds = mock(async () => []);

        const db = createStubDb();
        const def = entity('tasks', {
          model: d.model(tasksTable),
          access: { list: rules.public, get: rules.public, create: rules.public },
        });

        const handlers = createCrudHandlers(def, db, { tenantChain, queryParentIds });
        const ctx = makeCtx({ tenantId: 'org-1' });

        // Create with a valid UUID projectId that doesn't exist
        const result = await handlers.create(ctx, {
          title: 'My Task',
          projectId: '00000000-0000-4000-a000-000000000099',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
          expect(result.error.message).toContain('does not exist');
        }
      });
    });
  });
});
