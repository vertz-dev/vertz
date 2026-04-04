import type { EntityRouteEntry } from '@vertz/core';
import { createActionHandler } from './action-pipeline';
import { createEntityContext, type RequestInfo as EntityRequestInfo } from './context';
import type { ColumnBuilder, ColumnMetadata } from '@vertz/db';
import {
  createCrudHandlers,
  type EntityDbAdapter,
  type EntityId,
  type ListOptions,
} from './crud-pipeline';
import type { EntityOperations } from './entity-operations';
import type { EntityRegistry } from './entity-registry';
import { entityErrorHandler } from './error-handler';
import { type ExposeEvalConfig, evaluateExposeDescriptors } from './expose-evaluator';
import { applySelect, nullGuardedFields } from './field-filter';
import type { TenantChain } from './tenant-chain';
import type { EntityDefinition, EntityRelationsConfig } from './types';
import {
  type ExposeValidationConfig,
  MAX_CURSOR_LENGTH,
  MAX_LIMIT,
  parseVertzQL,
  type VertzQLIncludeEntry,
  validateVertzQL,
} from './vertzql-parser';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface EntityRouteOptions {
  apiPrefix?: string;
  /** Tenant chain for indirectly scoped entities. */
  tenantChain?: TenantChain | null;
  /** Resolves parent IDs for indirect tenant chain traversal. */
  queryParentIds?: import('./crud-pipeline').QueryParentIdsFn;
  /** Access config — enables entitlement evaluation in CRUD pipeline. */
  accessConfig?: import('./crud-pipeline').CrudAccessConfig;
  /** The resource type for the tenant root (e.g., 'workspace'). */
  tenantResourceType?: string;
  /** Closure store — for auto-populating tenant hierarchy on .tenant() entity creation. */
  closureStore?: import('../auth/closure-store').ClosureStore;
  /** Tenant levels — ordered chain of .tenant() levels from root to leaf. */
  tenantLevels?: readonly import('@vertz/db').TenantLevel[];
  /** When true, unknown errors include real message and stack trace. @default false */
  devMode?: boolean;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

// ---------------------------------------------------------------------------
// Request info extractor
// ---------------------------------------------------------------------------

function extractRequestInfo(ctx: Record<string, unknown>): EntityRequestInfo {
  return {
    userId: (ctx.userId as string | null | undefined) ?? null,
    tenantId: (ctx.tenantId as string | null | undefined) ?? null,
    tenantLevel: (ctx.tenantLevel as string | null | undefined) ?? null,
    roles: (ctx.roles as string[] | undefined) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Context helper
// ---------------------------------------------------------------------------

function getParams(ctx: Record<string, unknown>): Record<string, string> {
  return (ctx.params ?? {}) as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Expose descriptor detection
// ---------------------------------------------------------------------------

/**
 * Returns true if any value in the record is not `true` (i.e., is an AccessRule descriptor).
 */
function hasDescriptorValues(record: Record<string, unknown> | undefined): boolean {
  if (!record) return false;
  return Object.values(record).some((v) => v !== true);
}

/**
 * Checks if an expose config has any AccessRule descriptors that need runtime evaluation.
 */
function hasDescriptors(expose: {
  select?: Record<string, unknown>;
  allowWhere?: Record<string, unknown>;
  allowOrderBy?: Record<string, unknown>;
}): boolean {
  return (
    hasDescriptorValues(expose.select) ||
    hasDescriptorValues(expose.allowWhere) ||
    hasDescriptorValues(expose.allowOrderBy)
  );
}

/**
 * Applies nulling to a single row's fields based on evaluated expose descriptors.
 */
function applyNulling(
  data: Record<string, unknown>,
  nulledFields: Set<string>,
): Record<string, unknown> {
  return nullGuardedFields(nulledFields, data);
}

// ---------------------------------------------------------------------------
// Route generator
// ---------------------------------------------------------------------------

/**
 * Generates HTTP route entries for a single entity definition.
 *
 * Each entity produces up to 5 CRUD routes + N custom action routes.
 * Operations with no access rule are skipped (deny by default = no route).
 * Operations explicitly disabled (access: false) get a 405 handler.
 */
export function generateEntityRoutes(
  def: EntityDefinition,
  registry: EntityRegistry,
  db: EntityDbAdapter,
  options?: EntityRouteOptions,
): EntityRouteEntry[] {
  const prefix = options?.apiPrefix ?? '/api';
  const basePath = `${prefix}/${def.name}`;
  const devMode = options?.devMode;
  const tenantChain = options?.tenantChain ?? null;
  const exposeValidation: ExposeValidationConfig | undefined = def.expose
    ? {
        select: def.expose.select as Record<string, unknown> | undefined,
        allowWhere: def.expose.allowWhere as Record<string, unknown> | undefined,
        allowOrderBy: def.expose.allowOrderBy as Record<string, unknown> | undefined,
      }
    : undefined;

  // Check if expose config has any AccessRule descriptors that need runtime evaluation.
  // If all values are `true`, no per-request evaluation is needed.
  const exposeEvalConfig: ExposeEvalConfig | null = def.expose
    ? hasDescriptors(def.expose)
      ? (def.expose as ExposeEvalConfig)
      : null
    : null;

  const crudHandlers = createCrudHandlers(def, db, {
    tenantChain,
    queryParentIds: options?.queryParentIds,
    accessConfig: options?.accessConfig,
    tenantResourceType: options?.tenantResourceType,
    closureStore: options?.closureStore,
    tenantLevels: options?.tenantLevels,
  });
  const inject = def.inject ?? {};
  const registryProxy =
    Object.keys(inject).length > 0
      ? registry.createScopedProxy(inject)
      : ({} as Record<string, EntityOperations>);

  const routes: EntityRouteEntry[] = [];

  // Resolve PK columns for path generation
  const table = def.model.table;
  const pkColumns: string[] = table._primaryKey?.length
    ? [...table._primaryKey]
    : (() => {
        for (const [key, col] of Object.entries(table._columns)) {
          if ((col as ColumnBuilder<unknown, ColumnMetadata> | undefined)?._meta?.primary)
            return [key];
        }
        return ['id'];
      })();
  const isCompositePk = pkColumns.length > 1;
  const idPath = isCompositePk ? '/' + pkColumns.map((col) => `:${col}`).join('/') : '/:id';

  if (isCompositePk) {
    console.log(`[vertz] Entity "${def.name}" routes: ${basePath}${idPath} (composite PK)`);
  }

  /** Extract entity ID from request params based on PK structure. */
  function extractEntityId(ctx: Record<string, unknown>): EntityId {
    const params = getParams(ctx);
    if (isCompositePk) {
      const compositeId: Record<string, string> = {};
      for (const col of pkColumns) {
        compositeId[col] = params[col] as string;
      }
      return compositeId;
    }
    return params.id as string;
  }

  // Helper to build EntityContext from handler ctx
  function makeEntityCtx(ctx: Record<string, unknown>) {
    const requestInfo = extractRequestInfo(ctx);
    const entityOps = registry.get(def.name);
    return createEntityContext(requestInfo, entityOps, registryProxy);
  }

  // --- LIST ---
  if (def.access.list === undefined) {
    console.warn(
      `[vertz] Entity "${def.name}" operation "list" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
    );
  }
  if (def.access.list !== undefined) {
    if (def.access.list === false) {
      const list405Handler = async () =>
        jsonResponse(
          {
            error: {
              code: 'MethodNotAllowed',
              message: `Operation "list" is disabled for ${def.name}`,
            },
          },
          405,
        );
      routes.push({ method: 'GET', path: basePath, handler: list405Handler });
      routes.push({ method: 'POST', path: `${basePath}/query`, handler: list405Handler });
    } else {
      routes.push({
        method: 'GET',
        path: basePath,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const query = (ctx.query ?? {}) as Record<string, string>;
            const parsed = parseVertzQL(query);

            // Pre-evaluate expose descriptors once per request
            const evaluated = exposeEvalConfig
              ? await evaluateExposeDescriptors(exposeEvalConfig, entityCtx)
              : null;

            // Validate against entity schema and relations config
            const relationsConfig = (def.expose?.include ?? {}) as EntityRelationsConfig;
            const validation = validateVertzQL(
              parsed,
              def.model.table,
              relationsConfig,
              exposeValidation,
              evaluated ?? undefined,
            );
            if (!validation.ok) {
              return jsonResponse(
                { error: { code: 'BadRequest', message: validation.error } },
                400,
              );
            }

            const options: ListOptions = {
              where: parsed.where ? (parsed.where as Record<string, unknown>) : undefined,
              orderBy: parsed.orderBy,
              limit: parsed.limit,
              after: parsed.after,
              include: parsed.include,
            };
            const result = await crudHandlers.list(entityCtx, options);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(body, status);
            }

            // Apply nulling for descriptor-guarded fields
            if (evaluated && evaluated.nulledFields.size > 0 && result.data.body.items) {
              result.data.body.items = result.data.body.items.map((row) =>
                applyNulling(row as Record<string, unknown>, evaluated.nulledFields),
              );
            }

            // Apply select narrowing if requested
            if (parsed.select && result.data.body.items) {
              result.data.body.items = result.data.body.items.map((row) =>
                applySelect(parsed.select, row as Record<string, unknown>),
              );
            }

            return jsonResponse(result.data.body, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error, { devMode });
            return jsonResponse(body, status);
          }
        },
      });

      // --- POST query fallback (for large queries that don't fit in URL) ---
      routes.push({
        method: 'POST',
        path: `${basePath}/query`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const body = (ctx.body ?? {}) as Record<string, unknown>;

            // Validate cursor type and length before processing
            if (body.after !== undefined) {
              if (typeof body.after !== 'string') {
                return jsonResponse(
                  { error: { code: 'BadRequest', message: 'cursor must be a string' } },
                  400,
                );
              }
              if (body.after.length > MAX_CURSOR_LENGTH) {
                return jsonResponse(
                  {
                    error: {
                      code: 'BadRequest',
                      message: `cursor exceeds maximum length of ${MAX_CURSOR_LENGTH}`,
                    },
                  },
                  400,
                );
              }
            }

            const parsed = {
              where: body.where as Record<string, unknown> | undefined,
              orderBy: body.orderBy as Record<string, 'asc' | 'desc'> | undefined,
              limit:
                typeof body.limit === 'number' && Number.isFinite(body.limit)
                  ? Math.max(0, Math.min(body.limit, MAX_LIMIT))
                  : undefined,
              after: typeof body.after === 'string' ? body.after : undefined,
              select: body.select as Record<string, true> | undefined,
              include: body.include as Record<string, true | VertzQLIncludeEntry> | undefined,
            };

            // Pre-evaluate expose descriptors once per request
            const evaluated = exposeEvalConfig
              ? await evaluateExposeDescriptors(exposeEvalConfig, entityCtx)
              : null;

            const relationsConfig = (def.expose?.include ?? {}) as EntityRelationsConfig;
            const validation = validateVertzQL(
              parsed,
              def.model.table,
              relationsConfig,
              exposeValidation,
              evaluated ?? undefined,
            );
            if (!validation.ok) {
              return jsonResponse(
                { error: { code: 'BadRequest', message: validation.error } },
                400,
              );
            }

            const options: ListOptions = {
              where: parsed.where,
              orderBy: parsed.orderBy,
              limit: parsed.limit,
              after: parsed.after,
              include: parsed.include,
            };
            const result = await crudHandlers.list(entityCtx, options);
            if (!result.ok) {
              const { status, body: errBody } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(errBody, status);
            }

            // Apply nulling for descriptor-guarded fields
            if (evaluated && evaluated.nulledFields.size > 0 && result.data.body.items) {
              result.data.body.items = result.data.body.items.map((row) =>
                applyNulling(row as Record<string, unknown>, evaluated.nulledFields),
              );
            }

            // Apply select narrowing if requested
            if (parsed.select && result.data.body.items) {
              result.data.body.items = result.data.body.items.map((row) =>
                applySelect(parsed.select, row as Record<string, unknown>),
              );
            }

            return jsonResponse(result.data.body, result.data.status);
          } catch (error) {
            const { status, body: errBody } = entityErrorHandler(error, { devMode });
            return jsonResponse(errBody, status);
          }
        },
      });
    }
  }

  // --- GET ---
  if (def.access.get === undefined) {
    console.warn(
      `[vertz] Entity "${def.name}" operation "get" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
    );
  }
  if (def.access.get !== undefined) {
    if (def.access.get === false) {
      routes.push({
        method: 'GET',
        path: `${basePath}${idPath}`,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Operation "get" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
    } else {
      routes.push({
        method: 'GET',
        path: `${basePath}${idPath}`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = extractEntityId(ctx);

            // Parse q= param for select narrowing
            const query = (ctx.query ?? {}) as Record<string, string>;
            const parsed = parseVertzQL(query);

            // Pre-evaluate expose descriptors once per request
            const evaluated = exposeEvalConfig
              ? await evaluateExposeDescriptors(exposeEvalConfig, entityCtx)
              : null;

            // Validate select/include
            const relationsConfig = (def.expose?.include ?? {}) as EntityRelationsConfig;
            const validation = validateVertzQL(
              parsed,
              def.model.table,
              relationsConfig,
              exposeValidation,
              evaluated ?? undefined,
            );
            if (!validation.ok) {
              return jsonResponse(
                { error: { code: 'BadRequest', message: validation.error } },
                400,
              );
            }

            const getOptions = parsed.include ? { include: parsed.include } : undefined;
            const result = await crudHandlers.get(entityCtx, id, getOptions);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(body, status);
            }

            // Apply nulling for descriptor-guarded fields
            let responseBody = result.data.body as Record<string, unknown>;
            if (evaluated && evaluated.nulledFields.size > 0) {
              responseBody = applyNulling(responseBody, evaluated.nulledFields);
            }

            // Apply select narrowing if requested
            const body = parsed.select ? applySelect(parsed.select, responseBody) : responseBody;

            return jsonResponse(body, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error, { devMode });
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- CREATE ---
  if (def.access.create === undefined) {
    console.warn(
      `[vertz] Entity "${def.name}" operation "create" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
    );
  }
  if (def.access.create !== undefined) {
    if (def.access.create === false) {
      routes.push({
        method: 'POST',
        path: basePath,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Operation "create" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
    } else {
      routes.push({
        method: 'POST',
        path: basePath,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const data = (ctx.body ?? {}) as Record<string, unknown>;
            const result = await crudHandlers.create(entityCtx, data);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(body, status);
            }

            // Apply nulling for descriptor-guarded fields
            let responseBody = result.data.body as Record<string, unknown>;
            if (exposeEvalConfig) {
              const evaluated = await evaluateExposeDescriptors(exposeEvalConfig, entityCtx);
              if (evaluated.nulledFields.size > 0) {
                responseBody = applyNulling(responseBody, evaluated.nulledFields);
              }
            }

            return jsonResponse(responseBody, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error, { devMode });
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- UPDATE ---
  if (def.access.update === undefined) {
    console.warn(
      `[vertz] Entity "${def.name}" operation "update" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
    );
  }
  if (def.access.update !== undefined) {
    if (def.access.update === false) {
      routes.push({
        method: 'PATCH',
        path: `${basePath}${idPath}`,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Operation "update" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
    } else {
      routes.push({
        method: 'PATCH',
        path: `${basePath}${idPath}`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = extractEntityId(ctx);
            const data = (ctx.body ?? {}) as Record<string, unknown>;
            const result = await crudHandlers.update(entityCtx, id, data);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(body, status);
            }

            // Apply nulling for descriptor-guarded fields
            let responseBody = result.data.body as Record<string, unknown>;
            if (exposeEvalConfig) {
              const evaluated = await evaluateExposeDescriptors(exposeEvalConfig, entityCtx);
              if (evaluated.nulledFields.size > 0) {
                responseBody = applyNulling(responseBody, evaluated.nulledFields);
              }
            }

            return jsonResponse(responseBody, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error, { devMode });
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- DELETE ---
  if (def.access.delete === undefined) {
    console.warn(
      `[vertz] Entity "${def.name}" operation "delete" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
    );
  }
  if (def.access.delete !== undefined) {
    if (def.access.delete === false) {
      routes.push({
        method: 'DELETE',
        path: `${basePath}${idPath}`,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Operation "delete" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
    } else {
      routes.push({
        method: 'DELETE',
        path: `${basePath}${idPath}`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = extractEntityId(ctx);
            const result = await crudHandlers.delete(entityCtx, id);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(body, status);
            }
            if (result.data.status === 204) {
              return emptyResponse(204);
            }
            return jsonResponse(result.data.body, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error, { devMode });
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- CUSTOM ACTIONS ---
  for (const [actionName, actionDef] of Object.entries(def.actions)) {
    // Only register action route if it has an access rule
    if (def.access[actionName] === undefined) {
      console.warn(
        `[vertz] Entity "${def.name}" action "${actionName}" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
      );
      continue;
    }

    const method = (actionDef.method ?? 'POST').toUpperCase();
    const actionPath = actionDef.path
      ? `${basePath}/${actionDef.path}`
      : `${basePath}${idPath}/${actionName}`;
    const hasId = isCompositePk
      ? pkColumns.some((col) => actionPath.includes(`:${col}`))
      : actionPath.includes(':id');

    if (def.access[actionName] === false) {
      routes.push({
        method,
        path: actionPath,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Action "${actionName}" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
    } else {
      const actionHandler = createActionHandler(def, actionName, actionDef, db, hasId);
      routes.push({
        method,
        path: actionPath,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = hasId ? extractEntityId(ctx) : null;
            // For GET actions, input comes from query; for POST/PATCH/etc., from body
            const input = method === 'GET' ? (ctx.query ?? {}) : ctx.body;
            const result = await actionHandler(entityCtx, id, input);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error, { devMode });
              return jsonResponse(body, status);
            }
            return jsonResponse(result.data.body, result.data.status, result.data.headers);
          } catch (error) {
            const { status, body } = entityErrorHandler(error, { devMode });
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  return routes;
}
