import type {
  ColumnBuilder,
  ColumnMetadata,
  EntityDbAdapter,
  GetOptions,
  ListOptions,
  ModelDef,
  TableDef,
} from '@vertz/db';
import {
  type EntityError,
  EntityForbiddenError,
  EntityNotFoundError,
  err,
  ok,
  type Result,
} from '@vertz/errors';
import { enforceAccess, extractWhereConditions } from './access-enforcer';
import {
  applySelect,
  narrowRelationFields,
  stripHiddenFields,
  stripReadOnlyFields,
} from './field-filter';
import type { TenantChain } from './tenant-chain';
import type { EntityContext, EntityDefinition, EntityRelationsConfig } from './types';

// Re-export types from @vertz/db for backward compatibility
export type { EntityDbAdapter, GetOptions, ListOptions } from '@vertz/db';

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

export interface CrudHandlers<TModel extends ModelDef = ModelDef> {
  list(
    ctx: EntityContext<TModel>,
    options?: ListOptions,
  ): Promise<Result<CrudResult<ListResult<TModel['table']['$response']>>, EntityError>>;
  get(
    ctx: EntityContext<TModel>,
    id: string,
    options?: GetOptions,
  ): Promise<Result<CrudResult<TModel['table']['$response']>, EntityError>>;
  create(
    ctx: EntityContext<TModel>,
    data: Record<string, unknown>,
  ): Promise<Result<CrudResult<TModel['table']['$response']>, EntityError>>;
  update(
    ctx: EntityContext<TModel>,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Result<CrudResult<TModel['table']['$response']>, EntityError>>;
  delete(ctx: EntityContext<TModel>, id: string): Promise<Result<CrudResult<null>, EntityError>>;
}

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

/** Resolves IDs from a table matching a where condition. Used for indirect tenant filtering. */
export type QueryParentIdsFn = (
  tableName: string,
  where: Record<string, unknown>,
) => Promise<string[]>;

/** Options for the CRUD pipeline factory. */
export interface CrudPipelineOptions {
  /** Tenant chain for indirectly scoped entities. */
  tenantChain?: TenantChain | null;
  /** Resolves parent IDs for indirect tenant chain traversal. */
  queryParentIds?: QueryParentIdsFn;
}

export function createCrudHandlers<TModel extends ModelDef = ModelDef>(
  def: EntityDefinition<TModel>,
  db: EntityDbAdapter,
  options?: CrudPipelineOptions,
): CrudHandlers<TModel> {
  const table = def.model.table;
  const isTenantScoped = def.tenantScoped;
  const tenantChain = options?.tenantChain ?? def.tenantChain ?? null;
  const isIndirectlyScoped = tenantChain !== null;
  const queryParentIds = options?.queryParentIds ?? null;
  // Extract expose.select keys for applySelect (which checks key presence, not values).
  // Include relation keys from expose.include so they pass through applySelect.
  const exposeSelect = def.expose?.select
    ? {
        ...def.expose.select,
        ...Object.fromEntries(
          Object.entries(def.expose.include ?? {})
            .filter(([, v]) => v !== false)
            .map(([k]) => [k, true as const]),
        ),
      }
    : undefined;

  /** Returns 404 error for the entity */
  function notFound(id: string) {
    return err(new EntityNotFoundError(`${def.name} with id "${id}" not found`));
  }

  /** Checks if a row belongs to the current tenant. Returns false if cross-tenant. */
  function isSameTenant(ctx: EntityContext, row: Record<string, unknown>): boolean {
    if (!isTenantScoped) return true;
    // Indirect scoping uses subquery filtering, not row-level tenantId check
    if (isIndirectlyScoped) return true;
    return row.tenantId === ctx.tenantId;
  }

  /** Merges tenant filter into a where clause for list queries. */
  function withTenantFilter(
    ctx: EntityContext,
    where: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!isTenantScoped) return where;
    // Indirect scoping is handled separately via resolveIndirectTenantWhere
    if (isIndirectlyScoped) return where;
    return { ...where, tenantId: ctx.tenantId };
  }

  /**
   * Resolves allowed parent IDs by walking the tenant chain from root to entity.
   * Returns a where condition like { projectId: { in: [...] } } for the entity.
   * Returns null if no tenant context or no chain.
   */
  async function resolveIndirectTenantWhere(
    ctx: EntityContext,
  ): Promise<Record<string, unknown> | null> {
    if (!isIndirectlyScoped || !tenantChain || !queryParentIds) return null;
    if (!ctx.tenantId) {
      // No tenant = empty set — block all results
      return { [tenantChain.hops[0]!.foreignKey]: { in: [] } };
    }

    const { hops, tenantColumn } = tenantChain;

    // Walk chain from the last hop (closest to tenant root) backwards
    // Start: query last hop's table where tenantColumn = tenantId
    const lastHop = hops[hops.length - 1]!;
    let currentIds = await queryParentIds(lastHop.tableName, { [tenantColumn]: ctx.tenantId });

    // Walk remaining hops backwards
    for (let i = hops.length - 2; i >= 0; i--) {
      if (currentIds.length === 0) break;
      const hop = hops[i]!;
      const nextHop = hops[i + 1]!;
      currentIds = await queryParentIds(hop.tableName, {
        [nextHop.foreignKey]: { in: currentIds },
      });
    }

    // The first hop's foreignKey is the column on the entity table
    return { [hops[0]!.foreignKey]: { in: currentIds } };
  }

  /**
   * Verifies that a single row belongs to the current tenant via the indirect chain.
   * Uses the same chain resolution as list filtering — checks if the row's FK
   * is in the set of allowed parent IDs.
   */
  async function verifyIndirectTenantOwnership(
    ctx: EntityContext,
    row: Record<string, unknown>,
  ): Promise<boolean> {
    if (!isIndirectlyScoped || !tenantChain || !queryParentIds) return true;
    if (!ctx.tenantId) return false;

    const indirectWhere = await resolveIndirectTenantWhere(ctx);
    if (!indirectWhere) return false;

    const firstHopFK = tenantChain.hops[0]!.foreignKey;
    const allowed = indirectWhere[firstHopFK] as { in: string[] } | undefined;
    if (!allowed) return false;
    return allowed.in.includes(row[firstHopFK] as string);
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
      const directWhere = withTenantFilter(ctx, { ...accessWhere, ...cleanWhere });

      // Resolve indirect tenant filter (walks chain to find allowed parent IDs)
      const indirectWhere = await resolveIndirectTenantWhere(ctx);
      const where = indirectWhere ? { ...directWhere, ...indirectWhere } : directWhere;

      const limit = Math.max(0, options?.limit ?? 20);
      const after = options?.after && options.after.length <= 512 ? options.after : undefined;

      const orderBy = options?.orderBy;
      const include = options?.include;
      const { data: rows, total } = await db.list({ where, orderBy, limit, after, include });
      const data = rows.map((row) =>
        applySelect(
          exposeSelect,
          narrowRelationFields(
            (def.expose?.include ?? {}) as EntityRelationsConfig,
            stripHiddenFields(table, row),
          ),
        ),
      ) as TModel['table']['$response'][];

      // Compute nextCursor: if we got a full page, there may be more rows
      const pkColumn = resolvePrimaryKeyColumn(table);
      const lastRow = rows[rows.length - 1] as Record<string, unknown> | undefined;
      const nextCursor =
        limit > 0 && rows.length === limit && lastRow
          ? String(lastRow[pkColumn] as string | number)
          : null;
      const hasNextPage = nextCursor !== null;

      return ok({ status: 200, body: { items: data, total, limit, nextCursor, hasNextPage } });
    },

    async get(ctx, id, options) {
      const getOptions: GetOptions | undefined = options?.include
        ? { include: options.include }
        : undefined;
      const row = await db.get(id, getOptions);
      if (!row) return notFound(id);

      // Tenant check before access check — return 404 for cross-tenant (no information leakage)
      if (!isSameTenant(ctx, row)) return notFound(id);
      // Indirect tenant check — verify FK chain leads to current tenant
      if (isIndirectlyScoped && !(await verifyIndirectTenantOwnership(ctx, row))) {
        return notFound(id);
      }

      const accessResult = await enforceAccess('get', def.access, ctx, row);
      if (!accessResult.ok) return err(accessResult.error);

      return ok({
        status: 200,
        body: applySelect(
          exposeSelect,
          narrowRelationFields(
            (def.expose?.include ?? {}) as EntityRelationsConfig,
            stripHiddenFields(table, row),
          ),
        ) as TModel['table']['$response'],
      });
    },

    async create(ctx, data) {
      const accessResult = await enforceAccess('create', def.access, ctx);
      if (!accessResult.ok) return err(accessResult.error);

      let input = stripReadOnlyFields(table, data);

      // For indirectly scoped entities, verify the referenced parent belongs to the tenant
      if (isIndirectlyScoped && tenantChain && queryParentIds && ctx.tenantId) {
        const firstHop = tenantChain.hops[0]!;
        const parentId = input[firstHop.foreignKey] as string | undefined;
        if (!parentId) {
          return err(
            new EntityNotFoundError(
              `Referenced parent not found: ${firstHop.foreignKey} is required`,
            ),
          );
        }
        // Verify the parent exists and belongs to the tenant
        const parentExists = await queryParentIds(firstHop.tableName, {
          [firstHop.targetColumn]: parentId,
        });
        if (parentExists.length === 0) {
          return err(
            new EntityNotFoundError(
              `Referenced parent not found: ${firstHop.tableName} with ${firstHop.targetColumn} "${parentId}" does not exist`,
            ),
          );
        }
        // Verify parent belongs to tenant via the chain
        const indirectWhere = await resolveIndirectTenantWhere(ctx);
        if (indirectWhere) {
          const allowed = indirectWhere[firstHop.foreignKey] as { in: string[] } | undefined;
          if (!allowed || !allowed.in.includes(parentId)) {
            return err(
              new EntityForbiddenError(
                `Referenced ${firstHop.tableName} does not belong to your tenant`,
              ),
            );
          }
        }
      }

      // Auto-set tenantId from context for tenant-scoped entities
      if (isTenantScoped && !isIndirectlyScoped && ctx.tenantId) {
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

      return ok({
        status: 201,
        body: applySelect(
          exposeSelect,
          narrowRelationFields(
            (def.expose?.include ?? {}) as EntityRelationsConfig,
            strippedResult,
          ),
        ) as TModel['table']['$response'],
      });
    },

    async update(ctx, id, data) {
      const existing = await db.get(id);
      if (!existing) return notFound(id);

      // Tenant check before access check — return 404 for cross-tenant
      if (!isSameTenant(ctx, existing)) return notFound(id);
      if (isIndirectlyScoped && !(await verifyIndirectTenantOwnership(ctx, existing))) {
        return notFound(id);
      }

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
        body: applySelect(
          exposeSelect,
          narrowRelationFields(
            (def.expose?.include ?? {}) as EntityRelationsConfig,
            strippedResult,
          ),
        ) as TModel['table']['$response'],
      });
    },

    async delete(ctx, id) {
      const existing = await db.get(id);
      if (!existing) return notFound(id);

      // Tenant check before access check — return 404 for cross-tenant
      if (!isSameTenant(ctx, existing)) return notFound(id);
      if (isIndirectlyScoped && !(await verifyIndirectTenantOwnership(ctx, existing))) {
        return notFound(id);
      }

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
