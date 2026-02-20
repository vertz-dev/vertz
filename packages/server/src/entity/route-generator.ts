import type { EntityRouteEntry } from '@vertz/core';
import { createActionHandler } from './action-pipeline';
import { createEntityContext, type RequestInfo as EntityRequestInfo } from './context';
import { createCrudHandlers, type EntityDbAdapter, type ListOptions } from './crud-pipeline';
import type { EntityOperations } from './entity-operations';
import type { EntityRegistry } from './entity-registry';
import { entityErrorHandler } from './error-handler';
import type { EntityDefinition } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface EntityRouteOptions {
  apiPrefix?: string;
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

  const crudHandlers = createCrudHandlers(def, db);
  const registryProxy = registry.has(def.name)
    ? registry.createProxy()
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
                code: 'METHOD_NOT_ALLOWED',
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
            const { limit: limitStr, offset: offsetStr, after, ...whereParams } = query;
            const parsedLimit = limitStr ? Number.parseInt(limitStr, 10) : undefined;
            const parsedOffset = offsetStr ? Number.parseInt(offsetStr, 10) : undefined;
            const options: ListOptions = {
              where: Object.keys(whereParams).length > 0 ? whereParams : undefined,
              limit:
                parsedLimit !== undefined && !Number.isNaN(parsedLimit) ? parsedLimit : undefined,
              offset:
                parsedOffset !== undefined && !Number.isNaN(parsedOffset)
                  ? parsedOffset
                  : undefined,
              after: after || undefined,
            };
            const result = await crudHandlers.list(entityCtx, options);
            return jsonResponse(result.body, result.status);
          } catch (error) {
            const { status, body } = entityErrorHandler(error);
            return jsonResponse(body, status);
          }
        },
      });
    }
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
                code: 'METHOD_NOT_ALLOWED',
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
            const result = await crudHandlers.get(entityCtx, id);
            return jsonResponse(result.body, result.status);
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
                code: 'METHOD_NOT_ALLOWED',
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
            return jsonResponse(result.body, result.status);
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
                code: 'METHOD_NOT_ALLOWED',
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
            return jsonResponse(result.body, result.status);
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
                code: 'METHOD_NOT_ALLOWED',
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
            if (result.status === 204) {
              return emptyResponse(204);
            }
            return jsonResponse(result.body, result.status);
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

    if (def.access[actionName] === false) {
      routes.push({
        method: 'POST',
        path: `${basePath}/:id/${actionName}`,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'METHOD_NOT_ALLOWED',
                message: `Action "${actionName}" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
    } else {
      const actionHandler = createActionHandler(def, actionName, actionDef, db);
      routes.push({
        method: 'POST',
        path: `${basePath}/:id/${actionName}`,
        handler: async (ctx) => {
          try {
            const entityCtx = makeEntityCtx(ctx);
            const id = getParams(ctx).id as string;
            const input = ctx.body;
            const result = await actionHandler(entityCtx, id, input);
            return jsonResponse(result.body, result.status);
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
