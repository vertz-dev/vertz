import type {
  ColumnBuilder,
  ColumnMetadata,
  EntityDbAdapter,
  ListOptions,
  TableDef,
} from '@vertz/db';
import { type EntityError, EntityNotFoundError, err, ok, type Result } from '@vertz/errors';
import { enforceAccess, extractWhereConditions } from './access-enforcer';
import { narrowRelationFields, stripHiddenFields, stripReadOnlyFields } from './field-filter';
import type { EntityContext, EntityDefinition } from './types';

// Re-export types from @vertz/db for backward compatibility
export type { EntityDbAdapter, ListOptions } from '@vertz/db';

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
// List options — pagination & filtering (imported from @vertz/db)
// ---------------------------------------------------------------------------

// ListOptions is re-exported from @vertz/db above

export interface ListResult<T = Record<string, unknown>> {
  items: T[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}

// ---------------------------------------------------------------------------
// DB adapter interface — abstracts the actual database operations (imported from @vertz/db)
// ---------------------------------------------------------------------------

// EntityDbAdapter is re-exported from @vertz/db above

// ---------------------------------------------------------------------------
// CRUD handler result types
// ---------------------------------------------------------------------------

export interface CrudResult<T = unknown> {
  status: number;
  body: T;
}

export interface CrudHandlers {
  list(
    ctx: EntityContext,
    options?: ListOptions,
  ): Promise<Result<CrudResult<ListResult>, EntityError>>;
  get(
    ctx: EntityContext,
    id: string,
  ): Promise<Result<CrudResult<Record<string, unknown>>, EntityError>>;
  create(
    ctx: EntityContext,
    data: Record<string, unknown>,
  ): Promise<Result<CrudResult<Record<string, unknown>>, EntityError>>;
  update(
    ctx: EntityContext,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Result<CrudResult<Record<string, unknown>>, EntityError>>;
  delete(ctx: EntityContext, id: string): Promise<Result<CrudResult<null>, EntityError>>;
}

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

export function createCrudHandlers(def: EntityDefinition, db: EntityDbAdapter): CrudHandlers {
  const table = def.model.table;
  const isTenantScoped = def.tenantScoped;

  /** Returns 404 error for the entity */
  function notFound(id: string) {
    return err(new EntityNotFoundError(`${def.name} with id "${id}" not found`));
  }

  /** Checks if a row belongs to the current tenant. Returns false if cross-tenant. */
  function isSameTenant(ctx: EntityContext, row: Record<string, unknown>): boolean {
    if (!isTenantScoped) return true;
    return row.tenantId === ctx.tenantId;
  }

  /** Merges tenant filter into a where clause for list queries. */
  function withTenantFilter(
    ctx: EntityContext,
    where: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!isTenantScoped) return where;
    return { ...where, tenantId: ctx.tenantId };
  }

  return {
    async list(ctx, options) {
      // Extract where conditions from access rules and push to DB query
      const accessWhere = extractWhereConditions('list', def.access, ctx);
      const accessResult = await enforceAccess('list', def.access, ctx, undefined, {
        skipWhere: accessWhere !== null,
      });
      if (!accessResult.ok) return err(accessResult.error);

      // Strip hidden fields from where filter to prevent enumeration attacks
      const rawWhere = options?.where;
      const safeWhere = rawWhere ? stripHiddenFields(table, rawWhere) : undefined;
      const cleanWhere = safeWhere && Object.keys(safeWhere).length > 0 ? safeWhere : undefined;
      // Merge: tenant filter + access where conditions + user-provided where
      const where = withTenantFilter(ctx, { ...accessWhere, ...cleanWhere });

      const limit = Math.max(0, options?.limit ?? 20);
      const after = options?.after && options.after.length <= 512 ? options.after : undefined;

      const orderBy = options?.orderBy;
      const { data: rows, total } = await db.list({ where, orderBy, limit, after });
      const data = rows.map((row) =>
        narrowRelationFields(def.relations, stripHiddenFields(table, row)),
      );

      // Compute nextCursor: if we got a full page, there may be more rows
      const pkColumn = resolvePrimaryKeyColumn(table);
      const lastRow = rows[rows.length - 1];
      const nextCursor =
        limit > 0 && rows.length === limit && lastRow
          ? String(lastRow[pkColumn] as string | number)
          : null;
      const hasNextPage = nextCursor !== null;

      return ok({ status: 200, body: { items: data, total, limit, nextCursor, hasNextPage } });
    },

    async get(ctx, id) {
      const row = await db.get(id);
      if (!row) return notFound(id);

      // Tenant check before access check — return 404 for cross-tenant (no information leakage)
      if (!isSameTenant(ctx, row)) return notFound(id);

      const accessResult = await enforceAccess('get', def.access, ctx, row);
      if (!accessResult.ok) return err(accessResult.error);

      return ok({
        status: 200,
        body: narrowRelationFields(def.relations, stripHiddenFields(table, row)),
      });
    },

    async create(ctx, data) {
      const accessResult = await enforceAccess('create', def.access, ctx);
      if (!accessResult.ok) return err(accessResult.error);

      let input = stripReadOnlyFields(table, data);

      // Auto-set tenantId from context for tenant-scoped entities
      if (isTenantScoped && ctx.tenantId) {
        input = { ...input, tenantId: ctx.tenantId };
      }

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

      return ok({ status: 201, body: narrowRelationFields(def.relations, strippedResult) });
    },

    async update(ctx, id, data) {
      const existing = await db.get(id);
      if (!existing) return notFound(id);

      // Tenant check before access check — return 404 for cross-tenant
      if (!isSameTenant(ctx, existing)) return notFound(id);

      const accessResult = await enforceAccess('update', def.access, ctx, existing);
      if (!accessResult.ok) return err(accessResult.error);

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

      return ok({
        status: 200,
        body: narrowRelationFields(def.relations, strippedResult),
      });
    },

    async delete(ctx, id) {
      const existing = await db.get(id);
      if (!existing) return notFound(id);

      // Tenant check before access check — return 404 for cross-tenant
      if (!isSameTenant(ctx, existing)) return notFound(id);

      const accessResult = await enforceAccess('delete', def.access, ctx, existing);
      if (!accessResult.ok) return err(accessResult.error);

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

      return ok({ status: 204, body: null });
    },
  };
}
