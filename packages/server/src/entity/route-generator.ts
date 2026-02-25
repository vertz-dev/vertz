import type { EntityRouteEntry } from '@vertz/core';
import { createActionHandler } from './action-pipeline';
import { createEntityContext, type RequestInfo as EntityRequestInfo } from './context';
import { createCrudHandlers, type EntityDbAdapter, type ListOptions } from './crud-pipeline';
import type { EntityOperations } from './entity-operations';
import type { EntityRegistry } from './entity-registry';
import { entityErrorHandler } from './error-handler';
import { applySelect } from './field-filter';
import type { EntityDefinition } from './types';
import { parseVertzQL, validateVertzQL } from './vertzql-parser';

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

            // Validate against entity schema and relations config
            const relationsConfig = def.relations;
            const validation = validateVertzQL(parsed, def.model.table, relationsConfig);
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
            };
            const result = await crudHandlers.list(entityCtx, options);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error);
              return jsonResponse(body, status);
            }

            // Apply select narrowing if requested
            if (parsed.select && result.data.body.data) {
              result.data.body.data = result.data.body.data.map((row) =>
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
            include: body.include as Record<string, true | Record<string, true>> | undefined,
          };

          const relationsConfig = def.relations;
          const validation = validateVertzQL(parsed, def.model.table, relationsConfig);
          if (!validation.ok) {
            return jsonResponse({ error: { code: 'BadRequest', message: validation.error } }, 400);
          }

          const options: ListOptions = {
            where: parsed.where,
            orderBy: parsed.orderBy,
            limit: parsed.limit,
            after: parsed.after,
          };
          const result = await crudHandlers.list(entityCtx, options);
          if (!result.ok) {
            const { status, body: errBody } = entityErrorHandler(result.error);
            return jsonResponse(errBody, status);
          }

          // Apply select narrowing if requested
          if (parsed.select && result.data.body.data) {
            result.data.body.data = result.data.body.data.map((row) =>
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

            // Validate select/include
            const relationsConfig = def.relations;
            const validation = validateVertzQL(parsed, def.model.table, relationsConfig);
            if (!validation.ok) {
              return jsonResponse(
                { error: { code: 'BadRequest', message: validation.error } },
                400,
              );
            }

            const result = await crudHandlers.get(entityCtx, id);
            if (!result.ok) {
              const { status, body } = entityErrorHandler(result.error);
              return jsonResponse(body, status);
            }

            // Apply select narrowing if requested
            const body = parsed.select
              ? applySelect(parsed.select, result.data.body)
              : result.data.body;

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
            return jsonResponse(result.data.body, result.data.status);
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
            return jsonResponse(result.data.body, result.data.status);
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

    if (def.access[actionName] === false) {
      routes.push({
        method: 'POST',
        path: `${basePath}/:id/${actionName}`,
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
