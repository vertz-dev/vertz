import type { EntityRouteEntry } from '@vertz/core';
import { createActionHandler } from './action-pipeline';
import { createEntityContext, type RequestInfo as EntityRequestInfo } from './context';
import { createCrudHandlers, type EntityDbAdapter, type ListOptions } from './crud-pipeline';
import type { EntityOperations } from './entity-operations';
import type { EntityRegistry } from './entity-registry';
import { entityErrorHandler } from './error-handler';
import { type ExposeEvalConfig, evaluateExposeDescriptors } from './expose-evaluator';
import { applySelect, nullGuardedFields } from './field-filter';
import type { TenantChain } from './tenant-chain';
import type { EntityDefinition, EntityRelationsConfig } from './types';
import {
  type ExposeValidationConfig,
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
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
  });
  const inject = def.inject ?? {};
  const registryProxy =
    Object.keys(inject).length > 0
      ? registry.createScopedProxy(inject)
      : ({} as Record<string, EntityOperations>);

  const routes: EntityRouteEntry[] = [];

  // Helper to build EntityContext from handler ctx
  function makeEntityCtx(ctx: Record<string, unknown>) {
    const requestInfo = extractRequestInfo(ctx);
    const entityOps = {} as EntityOperations; // Operations are used via crudHandlers directly
    return createEntityContext(requestInfo, entityOps, registryProxy);
  }

  // --- LIST ---
  if (def.access.list !== undefined) {
    if (def.access.list === false) {
      routes.push({
        method: 'GET',
        path: basePath,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Operation "list" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
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
              const { status, body } = entityErrorHandler(result.error);
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
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }

    // --- POST query fallback (for large queries that don't fit in URL) ---
    routes.push({
      method: 'POST',
      path: `${basePath}/query`,
      handler: async (ctx) => {
        try {
          const entityCtx = makeEntityCtx(ctx);
          const body = (ctx.body ?? {}) as Record<string, unknown>;

          const parsed = {
            where: body.where as Record<string, unknown> | undefined,
            orderBy: body.orderBy as Record<string, 'asc' | 'desc'> | undefined,
            limit: typeof body.limit === 'number' ? body.limit : undefined,
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
            return jsonResponse({ error: { code: 'BadRequest', message: validation.error } }, 400);
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
            const { status, body: errBody } = entityErrorHandler(result.error);
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
          const { status, body: errBody } = entityErrorHandler(error);
          return jsonResponse(errBody, status);
        }
      },
    });
  }

  // --- GET ---
  if (def.access.get !== undefined) {
    if (def.access.get === false) {
      routes.push({
        method: 'GET',
        path: `${basePath}/:id`,
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
        path: `${basePath}/:id`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = getParams(ctx).id as string;

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
              const { status, body } = entityErrorHandler(result.error);
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
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- CREATE ---
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
              const { status, body } = entityErrorHandler(result.error);
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
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- UPDATE ---
  if (def.access.update !== undefined) {
    if (def.access.update === false) {
      routes.push({
        method: 'PATCH',
        path: `${basePath}/:id`,
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
        path: `${basePath}/:id`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = getParams(ctx).id as string;
            const data = (ctx.body ?? {}) as Record<string, unknown>;
            const result = await crudHandlers.update(entityCtx, id, data);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error);
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
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- DELETE ---
  if (def.access.delete !== undefined) {
    if (def.access.delete === false) {
      routes.push({
        method: 'DELETE',
        path: `${basePath}/:id`,
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
        path: `${basePath}/:id`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = getParams(ctx).id as string;
            const result = await crudHandlers.delete(entityCtx, id);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error);
              return jsonResponse(body, status);
            }
            if (result.data.status === 204) {
              return emptyResponse(204);
            }
            return jsonResponse(result.data.body, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  // --- CUSTOM ACTIONS ---
  for (const [actionName, actionDef] of Object.entries(def.actions)) {
    // Only register action route if it has an access rule
    if (def.access[actionName] === undefined) continue;

    const method = (actionDef.method ?? 'POST').toUpperCase();
    const actionPath = actionDef.path
      ? `${basePath}/${actionDef.path}`
      : `${basePath}/:id/${actionName}`;
    const hasId = actionPath.includes(':id');

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
            const id = hasId ? (getParams(ctx).id as string) : null;
            // For GET actions, input comes from query; for POST/PATCH/etc., from body
            const input = method === 'GET' ? (ctx.query ?? {}) : ctx.body;
            const result = await actionHandler(entityCtx, id, input);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error);
              return jsonResponse(body, status);
            }
            return jsonResponse(result.data.body, result.data.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }
  }

  return routes;
}
