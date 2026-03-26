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
import { createAccessContext } from '../auth/access-context';
import {
  type EnforceAccessOptions,
  enforceAccess,
  extractWhereConditions,
} from './access-enforcer';
import {
  applySelect,
  narrowRelationFields,
  stripHiddenFields,
  stripReadOnlyFields,
} from './field-filter';
import type { TenantChain } from './tenant-chain';
import type { EntityContext, EntityDefinition, EntityRelationsConfig } from './types';
import { MAX_CURSOR_LENGTH } from './vertzql-parser';

// Re-export types from @vertz/db for backward compatibility
export type { EntityDbAdapter, GetOptions, ListOptions } from '@vertz/db';

// Widened method types for calling db.update/db.delete with options.
// EntityDbAdapter's deferred conditional types (ResolveWhere) don't resolve
// when TEntry is the default ModelEntry. These aliases bypass the issue.
type WidenedUpdate = (
  id: string,
  data: Record<string, unknown>,
  options?: { where: Record<string, unknown> },
) => Promise<Record<string, unknown>>;
type WidenedDelete = (
  id: string,
  options?: { where: Record<string, unknown> },
) => Promise<Record<string, unknown> | null>;

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
  headers?: Record<string, string>;
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

/** Access config subset needed by the CRUD pipeline for entitlement evaluation. */
export interface CrudAccessConfig {
  definition: import('../auth/define-access').AccessDefinition;
  roleStore: import('../auth/role-assignment-store').RoleAssignmentStore;
  closureStore: import('../auth/closure-store').ClosureStore;
  flagStore?: import('../auth/flag-store').FlagStore;
  subscriptionStore?: import('../auth/subscription-store').SubscriptionStore;
}

/** Options for the CRUD pipeline factory. */
export interface CrudPipelineOptions {
  /** Tenant chain for indirectly scoped entities. */
  tenantChain?: TenantChain | null;
  /** Resolves parent IDs for indirect tenant chain traversal. */
  queryParentIds?: QueryParentIdsFn;
  /** Access config — enables entitlement evaluation via AccessContext. */
  accessConfig?: CrudAccessConfig;
  /** The resource type for the tenant root (e.g., 'workspace'). Used for entitlement RBAC checks. */
  tenantResourceType?: string;
  /** Closure store — for auto-populating tenant hierarchy on .tenant() entity creation. */
  closureStore?: import('../auth/closure-store').ClosureStore;
  /** Tenant levels — ordered chain of .tenant() levels from root to leaf. */
  tenantLevels?: readonly import('@vertz/db').TenantLevel[];
}

export function createCrudHandlers<TModel extends ModelDef = ModelDef>(
  def: EntityDefinition<TModel>,
  db: EntityDbAdapter,
  options?: CrudPipelineOptions,
): CrudHandlers<TModel> {
  const table = def.model.table;

  // Guard: entity CRUD does not support composite primary keys
  const pkCols: string[] = [];
  for (const key of Object.keys(table._columns)) {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    if (col?._meta.primary) pkCols.push(key);
  }
  if (pkCols.length > 1) {
    throw new Error(
      `Entity CRUD does not support composite primary keys. ` +
        `Table "${table._name}" has composite PK: [${pkCols.join(', ')}]. ` +
        `Use direct database queries or define a surrogate single-column PK.`,
    );
  }
  const isTenantScoped = def.tenantScoped;
  const tenantColumn = def.tenantColumn ?? 'tenantId';
  const tenantChain = options?.tenantChain ?? def.tenantChain ?? null;
  const isIndirectlyScoped = tenantChain !== null;
  const queryParentIds = options?.queryParentIds ?? null;
  const accessConfig = options?.accessConfig ?? null;
  const closureStore = options?.closureStore ?? null;
  const tenantLevels = options?.tenantLevels ?? null;
  const tenantResourceType = options?.tenantResourceType ?? null;

  /** Builds enforce access options with entitlement evaluation for the given request context. */
  function buildAccessOptions(ctx: EntityContext): EnforceAccessOptions {
    if (!accessConfig || !ctx.userId) return {};
    const accessCtx = createAccessContext({
      userId: ctx.userId,
      accessDef: accessConfig.definition,
      roleStore: accessConfig.roleStore,
      closureStore: accessConfig.closureStore,
      flagStore: accessConfig.flagStore,
      subscriptionStore: accessConfig.subscriptionStore,
    });
    return {
      can: (entitlement: string) =>
        accessCtx.can(
          entitlement,
          tenantResourceType && ctx.tenantId
            ? { type: tenantResourceType, id: ctx.tenantId }
            : undefined,
        ),
    };
  }
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

  /**
   * Resolves the correct tenant ID for filtering, handling cross-level scenarios.
   * When the user is at a deeper level than the entity's scope, resolves the
   * ancestor ID from the closure store.
   */
  async function resolveTenantIdForFilter(ctx: EntityContext): Promise<string | null> {
    if (!ctx.tenantId) return null;

    // Cross-level resolution: when user is deeper than entity scope
    if (closureStore && tenantLevels?.length && ctx.tenantLevel) {
      // Find the tenant table that the tenantColumn points to
      // tenantColumn = 'accountId' → accounts table → account level
      let targetLevel = tenantLevels.find((l) => {
        // Check if any child level has this tenantColumn as parentFk
        return tenantLevels.some(
          (child) => child.parentFk === tenantColumn && child.parentKey === l.key,
        );
      });
      // If no child references this column, the entity might directly reference a tenant table
      if (!targetLevel) {
        // Try matching by FK pattern: 'accountId' → 'accounts' table
        for (const level of tenantLevels) {
          // Simple heuristic: tenantColumn without 'Id' suffix matches table key
          const fkBase = tenantColumn.replace(/Id$/, '');
          if (level.key === fkBase) {
            targetLevel = level;
            break;
          }
        }
      }

      if (targetLevel) {
        const userLevel = tenantLevels.find((l) => l.key === ctx.tenantLevel);
        if (userLevel && targetLevel.depth < userLevel.depth) {
          // User is deeper than entity scope — resolve ancestor
          const ancestors = await closureStore.getAncestors(ctx.tenantLevel!, ctx.tenantId);
          const ancestor = ancestors.find((a) => a.type === targetLevel!.key && a.depth > 0);
          if (ancestor) {
            return ancestor.id;
          }
        }
      }
    }

    return ctx.tenantId;
  }

  /** Merges tenant filter into a where clause for DB queries (list, get, update, delete). */
  async function withTenantFilter(
    ctx: EntityContext,
    where: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown> | undefined> {
    if (!isTenantScoped) return where;
    // Indirect scoping is handled separately via resolveIndirectTenantWhere
    if (isIndirectlyScoped) return where;
    const resolvedTenantId = await resolveTenantIdForFilter(ctx);
    return { ...where, [tenantColumn]: resolvedTenantId };
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

  return {
    async list(ctx, options) {
      // Extract where conditions from access rules and push to DB query
      const accessWhere = extractWhereConditions('list', def.access, ctx);
      const accessOpts = buildAccessOptions(ctx);
      const accessResult = await enforceAccess('list', def.access, ctx, undefined, {
        skipWhere: accessWhere !== null,
        ...accessOpts,
      });
      if (!accessResult.ok) return err(accessResult.error);

      // Strip hidden fields from where filter to prevent enumeration attacks
      const rawWhere = options?.where;
      const safeWhere = rawWhere ? stripHiddenFields(table, rawWhere) : undefined;
      const cleanWhere = safeWhere && Object.keys(safeWhere).length > 0 ? safeWhere : undefined;
      // Merge: tenant filter + access where conditions + user-provided where
      const directWhere = await withTenantFilter(ctx, { ...accessWhere, ...cleanWhere });

      // Resolve indirect tenant filter (walks chain to find allowed parent IDs)
      const indirectWhere = await resolveIndirectTenantWhere(ctx);
      const where = indirectWhere ? { ...directWhere, ...indirectWhere } : directWhere;

      const limit = Math.max(0, options?.limit ?? 20);
      const after =
        options?.after && options.after.length <= MAX_CURSOR_LENGTH ? options.after : undefined;

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
      // Extract where conditions from access rules and push to DB query
      const accessWhere = extractWhereConditions('get', def.access, ctx);
      const tenantWhere = await withTenantFilter(ctx, accessWhere ?? undefined);
      const indirectWhere = isIndirectlyScoped ? await resolveIndirectTenantWhere(ctx) : null;
      const dbWhere = indirectWhere ? { ...(tenantWhere ?? {}), ...indirectWhere } : tenantWhere;

      const hasWhere = dbWhere && Object.keys(dbWhere).length > 0;
      const hasInclude = !!options?.include;
      const getOpts =
        hasWhere || hasInclude
          ? ({
              ...(hasInclude && { include: options!.include }),
              ...(hasWhere && { where: dbWhere }),
            } as Parameters<typeof db.get>[1])
          : undefined;
      const row = await db.get(id, getOpts);
      if (!row) return notFound(id);

      // Enforce non-where access rules (authenticated, entitlement, role, fva).
      // skipWhere is true when extractWhereConditions returned non-null (meaning where
      // conditions were pushed to DB). null means no where rules exist.
      const accessResult = await enforceAccess('get', def.access, ctx, row, {
        skipWhere: accessWhere !== null,
        ...buildAccessOptions(ctx),
      });
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
      const accessResult = await enforceAccess(
        'create',
        def.access,
        ctx,
        undefined,
        buildAccessOptions(ctx),
      );
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

      // Auto-set tenant column from context for directly scoped entities
      if (isTenantScoped && !isIndirectlyScoped && ctx.tenantId) {
        const resolvedTenantId = await resolveTenantIdForFilter(ctx);
        input = { ...input, [tenantColumn]: resolvedTenantId };
      }

      // Apply before.create hook
      if (def.before.create) {
        input = (await def.before.create(input, ctx)) as Record<string, unknown>;
      }

      const result = await db.create(input);
      const strippedResult = stripHiddenFields(table, result);

      // Auto-populate closure table for .tenant() entities
      if (closureStore && tenantLevels?.length && table._tenant) {
        const entityLevel = tenantLevels.find((l) => l.tableName === table._name);
        if (entityLevel) {
          const pkColumn = resolvePrimaryKeyColumn(table);
          const row = result as Record<string, unknown>;
          const newId = row[pkColumn];
          if (entityLevel.parentFk && entityLevel.parentKey) {
            const parentId = row[entityLevel.parentFk] ?? input[entityLevel.parentFk];
            if (parentId) {
              try {
                await closureStore.addResource(entityLevel.key, String(newId), {
                  parentType: entityLevel.parentKey,
                  parentId: String(parentId),
                });
              } catch (e) {
                console.warn(
                  `[vertz] Failed to populate closure table for ${entityLevel.key}:${newId}:`,
                  e,
                );
              }
            } else {
              console.warn(
                `[vertz] Tenant entity ${entityLevel.key} created without parent FK ` +
                  `(${entityLevel.parentFk}). Closure table NOT populated. ` +
                  `Ancestor resolution will fail for this entity.`,
              );
            }
          } else {
            // Root tenant — no parent
            try {
              await closureStore.addResource(entityLevel.key, String(newId));
            } catch (e) {
              console.warn(
                `[vertz] Failed to populate closure table for root ${entityLevel.key}:${newId}:`,
                e,
              );
            }
          }
        }
      }

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
      // Extract where conditions from access rules and push to DB query
      const accessWhere = extractWhereConditions('update', def.access, ctx);
      const tenantWhere = await withTenantFilter(ctx, accessWhere ?? undefined);
      const indirectWhere = isIndirectlyScoped ? await resolveIndirectTenantWhere(ctx) : null;
      const dbWhere = indirectWhere ? { ...(tenantWhere ?? {}), ...indirectWhere } : tenantWhere;

      const hasWhere = dbWhere && Object.keys(dbWhere).length > 0;
      const whereOpts = hasWhere ? ({ where: dbWhere } as Parameters<typeof db.get>[1]) : undefined;

      const existing = await db.get(id, whereOpts);
      if (!existing) return notFound(id);

      const accessResult = await enforceAccess('update', def.access, ctx, existing, {
        skipWhere: accessWhere !== null,
        ...buildAccessOptions(ctx),
      });
      if (!accessResult.ok) return err(accessResult.error);

      let input = stripReadOnlyFields(table, data);

      // Apply before.update hook
      if (def.before.update) {
        input = (await def.before.update(input, ctx)) as Record<string, unknown>;
      }

      // Defense-in-depth: when where conditions exist, pass them to the UPDATE
      // statement. If a concurrent write changes ownership between db.get() and
      // db.update(), the UPDATE WHERE will match 0 rows and the adapter throws.
      let result: Record<string, unknown>;
      if (hasWhere) {
        try {
          result = await (db.update as WidenedUpdate)(id, input, { where: dbWhere });
        } catch {
          // TOCTOU race: row changed between get() and update(). Treat as not found.
          return notFound(id);
        }
      } else {
        result = await db.update(id, input);
      }
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
      // Extract where conditions from access rules and push to DB query
      const accessWhere = extractWhereConditions('delete', def.access, ctx);
      const tenantWhere = await withTenantFilter(ctx, accessWhere ?? undefined);
      const indirectWhere = isIndirectlyScoped ? await resolveIndirectTenantWhere(ctx) : null;
      const dbWhere = indirectWhere ? { ...(tenantWhere ?? {}), ...indirectWhere } : tenantWhere;

      const hasWhere = dbWhere && Object.keys(dbWhere).length > 0;
      const whereOpts = hasWhere ? ({ where: dbWhere } as Parameters<typeof db.get>[1]) : undefined;

      const existing = await db.get(id, whereOpts);
      if (!existing) return notFound(id);

      const accessResult = await enforceAccess('delete', def.access, ctx, existing, {
        skipWhere: accessWhere !== null,
        ...buildAccessOptions(ctx),
      });
      if (!accessResult.ok) return err(accessResult.error);

      // Defense-in-depth: when where conditions exist, pass them to the DELETE
      // statement. Check return value (bridge adapter returns null on failure)
      // AND catch exceptions for adapters that throw on 0-row matches.
      let deleted: Record<string, unknown> | null;
      if (hasWhere) {
        try {
          deleted = await (db.delete as WidenedDelete)(id, { where: dbWhere });
        } catch {
          // TOCTOU race: row changed between get() and delete(). Treat as not found.
          return notFound(id);
        }
        if (!deleted) return notFound(id);
      } else {
        deleted = await db.delete(id);
      }

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
