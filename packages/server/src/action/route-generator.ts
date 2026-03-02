import type { EntityRouteEntry } from '@vertz/core';
import { enforceAccess } from '../entity/access-enforcer';
import type { RequestInfo } from '../entity/context';
import type { EntityOperations } from '../entity/entity-operations';
import type { EntityRegistry } from '../entity/entity-registry';
import { createActionContext } from './context';
import type { ActionDefinition } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ActionRouteOptions {
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

// ---------------------------------------------------------------------------
// Request info extractor
// ---------------------------------------------------------------------------

function extractRequestInfo(ctx: Record<string, unknown>): RequestInfo {
  return {
    userId: (ctx.userId as string | null | undefined) ?? null,
    tenantId: (ctx.tenantId as string | null | undefined) ?? null,
    roles: (ctx.roles as string[] | undefined) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Route generator
// ---------------------------------------------------------------------------

/**
 * Generates HTTP route entries for a standalone action definition.
 *
 * Each action handler produces one route: `{method} /{prefix}/{actionName}/{handlerName}`.
 * Handlers with no access rule are skipped (deny by default = no route).
 * Handlers with `access: false` get a 405 handler.
 */
export function generateActionRoutes(
  def: ActionDefinition,
  registry: EntityRegistry,
  options?: ActionRouteOptions,
): EntityRouteEntry[] {
  const prefix = options?.apiPrefix ?? '/api';
  const inject = def.inject ?? {};
  const registryProxy =
    Object.keys(inject).length > 0
      ? registry.createScopedProxy(inject)
      : ({} as Record<string, EntityOperations>);

  const routes: EntityRouteEntry[] = [];

  for (const [handlerName, handlerDef] of Object.entries(def.actions)) {
    const accessRule = def.access[handlerName];

    // No access rule → deny by default → skip (no route generated)
    if (accessRule === undefined) continue;

    const method = (handlerDef.method ?? 'POST').toUpperCase();
    const handlerPath = handlerDef.path ?? `${prefix}/${def.name}/${handlerName}`;
    const routePath = handlerDef.path ? handlerPath : `${prefix}/${def.name}/${handlerName}`;

    if (accessRule === false) {
      // Explicitly disabled → 405
      routes.push({
        method,
        path: routePath,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Action "${handlerName}" is disabled for ${def.name}`,
              },
            },
            405,
          ),
      });
      continue;
    }

    // Active route
    routes.push({
      method,
      path: routePath,
      handler: async (ctx) => {
        try {
          const requestInfo = extractRequestInfo(ctx);
          const actionCtx = createActionContext(requestInfo, registryProxy);

          // Enforce access rule
          const accessResult = await enforceAccess(handlerName, def.access, actionCtx);
          if (!accessResult.ok) {
            return jsonResponse(
              { error: { code: 'Forbidden', message: accessResult.error.message } },
              403,
            );
          }

          // Parse and validate body
          const rawBody = ctx.body ?? {};
          const parsed = handlerDef.body.parse(rawBody);
          if (!parsed.ok) {
            const message =
              parsed.error instanceof Error ? parsed.error.message : 'Invalid request body';
            return jsonResponse({ error: { code: 'BadRequest', message } }, 400);
          }

          // Execute handler
          const result = await handlerDef.handler(parsed.data, actionCtx);

          // Validate response
          const responseParsed = handlerDef.response.parse(result);
          if (!responseParsed.ok) {
            const message =
              responseParsed.error instanceof Error
                ? responseParsed.error.message
                : 'Response validation failed';
            console.warn(`[vertz] Action response validation warning: ${message}`);
          }

          return jsonResponse(result, 200);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Internal server error';
          return jsonResponse({ error: { code: 'InternalServerError', message } }, 500);
        }
      },
    });
  }

  return routes;
}
