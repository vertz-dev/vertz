import { NotFoundException } from '@vertz/core';
import type { ColumnBuilder, ColumnMetadata, TableDef } from '@vertz/db';
import { enforceAccess } from './access-enforcer';
import { stripHiddenFields, stripReadOnlyFields } from './field-filter';
import type { EntityContext, EntityDefinition } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves the primary key column name from a table definition. */
function resolvePrimaryKeyColumn(table: TableDef): string {
  for (const key of Object.keys(table._columns)) {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    if (col?._meta.primary) return key;
  }
  return 'id';
}

// ---------------------------------------------------------------------------
// List options — pagination & filtering
// ---------------------------------------------------------------------------

export interface ListOptions {
  where?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  /** Cursor-based pagination: fetch records after this ID. Takes precedence over offset. */
  after?: string;
}

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// DB adapter interface — abstracts the actual database operations
// ---------------------------------------------------------------------------

export interface EntityDbAdapter {
  get(id: string): Promise<Record<string, unknown> | null>;
  list(options?: ListOptions): Promise<{ data: Record<string, unknown>[]; total: number }>;
  create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<Record<string, unknown> | null>;
}

// ---------------------------------------------------------------------------
// CRUD handler result types
// ---------------------------------------------------------------------------

export interface CrudResult<T = unknown> {
  status: number;
  body: T;
}

export interface CrudHandlers {
  list(ctx: EntityContext, options?: ListOptions): Promise<CrudResult<ListResult>>;
  get(ctx: EntityContext, id: string): Promise<CrudResult<Record<string, unknown>>>;
  create(
    ctx: EntityContext,
    data: Record<string, unknown>,
  ): Promise<CrudResult<Record<string, unknown>>>;
  update(
    ctx: EntityContext,
    id: string,
    data: Record<string, unknown>,
  ): Promise<CrudResult<Record<string, unknown>>>;
  delete(ctx: EntityContext, id: string): Promise<CrudResult<null>>;
}

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

export function createCrudHandlers(def: EntityDefinition, db: EntityDbAdapter): CrudHandlers {
  const table = def.model.table;

  return {
    async list(ctx, options) {
      await enforceAccess('list', def.access, ctx);

      // Strip hidden fields from where filter to prevent enumeration attacks
      const rawWhere = options?.where;
      const safeWhere = rawWhere ? stripHiddenFields(table, rawWhere) : undefined;
      const where = safeWhere && Object.keys(safeWhere).length > 0 ? safeWhere : undefined;

      const limit = Math.max(0, options?.limit ?? 20);
      const offset = Math.max(0, options?.offset ?? 0);
      const after = options?.after && options.after.length <= 512 ? options.after : undefined;

      // Cursor-based pagination takes precedence over offset
      const { data: rows, total } = await db.list({ where, limit, offset, after });
      const data = rows.map((row) => stripHiddenFields(table, row));

      // Compute nextCursor: if we got a full page, there may be more rows
      const pkColumn = resolvePrimaryKeyColumn(table);
      const lastRow = rows[rows.length - 1];
      const nextCursor =
        limit > 0 && rows.length === limit && lastRow
          ? String(lastRow[pkColumn] as string | number)
          : null;

      return { status: 200, body: { data, total, limit, offset, nextCursor } };
    },

    async get(ctx, id) {
      const row = await db.get(id);
      if (!row) {
        throw new NotFoundException(`${def.name} with id "${id}" not found`);
      }

      await enforceAccess('get', def.access, ctx, row);

      return { status: 200, body: stripHiddenFields(table, row) };
    },

    async create(ctx, data) {
      await enforceAccess('create', def.access, ctx);

      let input = stripReadOnlyFields(table, data);

      // Apply before.create hook
      if (def.before.create) {
        input = (await def.before.create(input, ctx)) as Record<string, unknown>;
      }

      const result = await db.create(input);
      const strippedResult = stripHiddenFields(table, result);

      // Fire after.create (fire-and-forget, errors swallowed)
      // Pass stripped result to prevent hidden field leakage
      if (def.after.create) {
        try {
          await def.after.create(strippedResult, ctx);
        } catch {
          // After hooks are fire-and-forget
        }
      }

      return { status: 201, body: strippedResult };
    },

    async update(ctx, id, data) {
      const existing = await db.get(id);
      if (!existing) {
        throw new NotFoundException(`${def.name} with id "${id}" not found`);
      }

      await enforceAccess('update', def.access, ctx, existing);

      let input = stripReadOnlyFields(table, data);

      // Apply before.update hook
      if (def.before.update) {
        input = (await def.before.update(input, ctx)) as Record<string, unknown>;
      }

      const result = await db.update(id, input);
      const strippedExisting = stripHiddenFields(table, existing);
      const strippedResult = stripHiddenFields(table, result);

      // Fire after.update (fire-and-forget)
      // Pass stripped data to prevent hidden field leakage
      if (def.after.update) {
        try {
          await def.after.update(strippedExisting, strippedResult, ctx);
        } catch {
          // After hooks are fire-and-forget
        }
      }

      return { status: 200, body: strippedResult };
    },

    async delete(ctx, id) {
      const existing = await db.get(id);
      if (!existing) {
        throw new NotFoundException(`${def.name} with id "${id}" not found`);
      }

      await enforceAccess('delete', def.access, ctx, existing);

      await db.delete(id);

      // Fire after.delete (fire-and-forget)
      // Pass stripped data to prevent hidden field leakage
      if (def.after.delete) {
        try {
          await def.after.delete(stripHiddenFields(table, existing), ctx);
        } catch {
          // After hooks are fire-and-forget
        }
      }

      return { status: 204, body: null };
    },
  };
}
