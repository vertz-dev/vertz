import { NotFoundException } from '@vertz/core';
import { enforceAccess } from './access-enforcer';
import { stripHiddenFields, stripReadOnlyFields } from './field-filter';
import type { EntityContext, EntityDefinition } from './types';

// ---------------------------------------------------------------------------
// DB adapter interface — abstracts the actual database operations
// ---------------------------------------------------------------------------

export interface EntityDbAdapter {
  get(id: string): Promise<Record<string, unknown> | null>;
  list(): Promise<Record<string, unknown>[]>;
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
  list(ctx: EntityContext): Promise<CrudResult<{ data: Record<string, unknown>[] }>>;
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
    async list(ctx) {
      await enforceAccess('list', def.access, ctx);

      const rows = await db.list();
      const data = rows.map((row) => stripHiddenFields(table, row));

      return { status: 200, body: { data } };
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
