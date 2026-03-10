import type { EntityRouteEntry } from '@vertz/core';
import { isContentDescriptor } from '../content';
import { enforceAccess } from '../entity/access-enforcer';
import type { RequestInfo } from '../entity/context';
import type { EntityOperations } from '../entity/entity-operations';
import type { EntityRegistry } from '../entity/entity-registry';
import { createServiceContext } from './context';
import type { ServiceDefinition } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ServiceRouteOptions {
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
 * Generates HTTP route entries for a standalone service definition.
 *
 * Each action handler produces one route: `{method} /{prefix}/{serviceName}/{handlerName}`.
 * Handlers with no access rule are skipped (deny by default = no route).
 * Handlers with `access: false` get a 405 handler.
 */
export function generateServiceRoutes(
  def: ServiceDefinition,
  registry: EntityRegistry,
  options?: ServiceRouteOptions,
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
          const raw = ctx.raw as { url?: string; method?: string; headers?: Headers } | undefined;
          // Construct a fresh Headers to avoid immutable-proxy issues
          // (ctx.raw.headers may be a Proxy that breaks Headers.get())
          const ctxHeaders = ctx.headers as Record<string, string> | undefined;
          const rawRequest = {
            url: raw?.url ?? '',
            method: raw?.method ?? '',
            headers: new Headers(ctxHeaders ?? {}),
            body: ctx.body,
          };
          const serviceCtx = createServiceContext(requestInfo, registryProxy, rawRequest);

          // Enforce access rule
          const accessResult = await enforceAccess(handlerName, def.access, serviceCtx);
          if (!accessResult.ok) {
            return jsonResponse(
              { error: { code: 'Forbidden', message: accessResult.error.message } },
              403,
            );
          }

          // Content-type mismatch check — 415 when body is a content descriptor
          if (handlerDef.body && isContentDescriptor(handlerDef.body)) {
            const reqContentType = rawRequest.headers.get('content-type')?.toLowerCase() ?? '';
            const expected = handlerDef.body._contentType;
            const isXml = expected === 'application/xml';
            const matches = isXml
              ? reqContentType.includes('application/xml') || reqContentType.includes('text/xml')
              : reqContentType.includes(expected);
            if (reqContentType && !matches) {
              return jsonResponse(
                {
                  error: {
                    code: 'UnsupportedMediaType',
                    message: `Expected content-type ${expected}, got ${reqContentType}`,
                  },
                },
                415,
              );
            }
          }

          // Parse and validate body (skip when no body schema — e.g. GET actions)
          let input: unknown;
          if (handlerDef.body) {
            const rawBody = ctx.body ?? {};
            const parsed = handlerDef.body.parse(rawBody);
            if (!parsed.ok) {
              const message =
                parsed.error instanceof Error ? parsed.error.message : 'Invalid request body';
              return jsonResponse({ error: { code: 'BadRequest', message } }, 400);
            }
            input = parsed.data;
          }

          // Execute handler
          const result = await handlerDef.handler(input, serviceCtx);

          // Validate response
          const responseParsed = handlerDef.response.parse(result);
          if (!responseParsed.ok) {
            const message =
              responseParsed.error instanceof Error
                ? responseParsed.error.message
                : 'Response validation failed';
            console.warn(`[vertz] Service response validation warning: ${message}`);
          }

          // Content descriptor → wrap with the descriptor's content-type
          if (isContentDescriptor(handlerDef.response)) {
            const body =
              result instanceof Uint8Array ? (result as unknown as BlobPart) : String(result);
            return new Response(body, {
              status: 200,
              headers: { 'content-type': handlerDef.response._contentType },
            });
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
