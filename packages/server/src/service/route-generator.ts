import type { EntityRouteEntry } from '@vertz/core';
import { isContentDescriptor } from '../content';
import { enforceAccess } from '../entity/access-enforcer';
import type { RequestInfo } from '../entity/context';
import type { EntityOperations } from '../entity/entity-operations';
import type { EntityRegistry } from '../entity/entity-registry';
import { entityErrorHandler } from '../entity/error-handler';
import { filterProtectedHeaders, isResponseDescriptor } from '../response';
import { createServiceContext } from './context';
import type { ServiceDefinition } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ServiceRouteOptions {
  apiPrefix?: string;
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
 * Each action handler produces one route: `{method} {prefix}/{serviceName}/{handlerName}`.
 * When a custom `path` is provided, the route becomes `{method} {prefix}/{customPath}`.
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
    if (accessRule === undefined) {
      console.warn(
        `[vertz] Service "${def.name}" action "${handlerName}" has no access rule — route not generated (deny-by-default). Add an access rule or use rules.public to enable this route.`,
      );
      continue;
    }

    const method = (handlerDef.method ?? 'POST').toUpperCase();
    const routePath = handlerDef.path
      ? `${prefix}/${handlerDef.path.replace(/^\/+/, '')}`
      : `${prefix}/${def.name}/${handlerName}`;

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
      handler: async (ctx: Record<string, unknown>) => {
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
            params: (ctx.params ?? {}) as Record<string, string>,
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
          const rawResult = await handlerDef.handler(input, serviceCtx);

          // Unwrap ResponseDescriptor if present
          const isResp = isResponseDescriptor(rawResult);
          const result = isResp ? rawResult.data : rawResult;
          const customStatus = isResp ? rawResult.status : undefined;
          const filteredHeaders = isResp ? filterProtectedHeaders(rawResult.headers) : undefined;

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
            const headers = new Headers(filteredHeaders);
            headers.set('content-type', handlerDef.response._contentType);
            return new Response(body, {
              status: customStatus ?? 200,
              headers,
            });
          }

          return jsonResponse(result, customStatus ?? 200, filteredHeaders);
        } catch (error) {
          const result = entityErrorHandler(error, { devMode: options?.devMode });
          return jsonResponse(result.body, result.status);
        }
      },
    });
  }

  return routes;
}
