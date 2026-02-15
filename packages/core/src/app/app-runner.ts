import { buildCtx } from '../context/ctx-builder';
import { BadRequestException } from '../exceptions';
import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import { type ResolvedMiddleware, runMiddlewareChain } from '../middleware/middleware-runner';
import type { NamedModule } from '../module/module';
import type { NamedServiceDef } from '../module/service';
import { Trie } from '../router/trie';
import { applyCorsHeaders, handleCors } from '../server/cors';
import { parseBody, parseRequest } from '../server/request-utils';
import { createErrorResponse, createJsonResponse } from '../server/response-utils';
import type { AppConfig } from '../types/app';
import type { HandlerCtx } from '../types/context';
import { isOk, isResult } from '../result';

/**
 * Creates a JSON response and applies CORS headers if configured.
 */
function createResponseWithCors(
  data: unknown,
  status: number,
  config: AppConfig,
  request: Request,
): Response {
  const response = createJsonResponse(data, status);
  if (config.cors) {
    return applyCorsHeaders(config.cors, request, response);
  }
  return response;
}

export interface ModuleRegistration {
  module: NamedModule;
  options?: Record<string, unknown>;
}

type SchemaLike = { parse(value: unknown): unknown };

function validateSchema(schema: SchemaLike, value: unknown, label: string): unknown {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    const message = error instanceof Error ? error.message : `Invalid ${label}`;
    throw new BadRequestException(message);
  }
}

interface RouteEntry {
  handler: (ctx: HandlerCtx) => unknown;
  options: Record<string, unknown>;
  services: Record<string, unknown>;
  middlewares: ResolvedMiddleware[];
  paramsSchema?: SchemaLike;
  bodySchema?: SchemaLike;
  querySchema?: SchemaLike;
  headersSchema?: SchemaLike;
  responseSchema?: SchemaLike;
  errorsSchema?: Record<number, SchemaLike>;
}

function resolveServices(registrations: ModuleRegistration[]): Map<NamedServiceDef, unknown> {
  const serviceMap = new Map<NamedServiceDef, unknown>();

  for (const { module, options } of registrations) {
    for (const service of module.services) {
      if (!serviceMap.has(service)) {
        // Parse options from module registration against service schema
        let parsedOptions: Record<string, unknown> = {};
        if (service.options && options) {
          const parsed = service.options.safeParse(options);
          if (parsed.success) {
            parsedOptions = parsed.data;
          } else {
            throw new Error(
              `Invalid options for service ${service.moduleName}: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
            );
          }
        }

        // For now, env is empty - could be extended to accept env from config
        const env: Record<string, unknown> = {};

        serviceMap.set(service, service.methods({}, undefined, parsedOptions, env));
      }
    }
  }

  return serviceMap;
}

function resolveMiddlewares(
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  globalMiddlewares: NamedMiddlewareDef<any, any>[],
): ResolvedMiddleware[] {
  return globalMiddlewares.map((mw) => ({
    name: mw.name,
    handler: mw.handler,
    resolvedInject: {},
  }));
}

function resolveRouterServices(
  inject: Record<string, unknown> | undefined,
  serviceMap: Map<NamedServiceDef, unknown>,
): Record<string, unknown> {
  if (!inject) return {};

  const resolved: Record<string, unknown> = {};
  for (const [name, serviceDef] of Object.entries(inject)) {
    const methods = serviceMap.get(serviceDef as NamedServiceDef);
    if (methods) resolved[name] = methods;
  }
  return resolved;
}

function registerRoutes(
  trie: Trie,
  basePath: string,
  registrations: ModuleRegistration[],
  serviceMap: Map<NamedServiceDef, unknown>,
): void {
  for (const { module, options } of registrations) {
    for (const router of module.routers) {
      const resolvedServices = resolveRouterServices(router.inject, serviceMap);

      for (const route of router.routes) {
        const fullPath = basePath + router.prefix + route.path;
        const routeMiddlewares: ResolvedMiddleware[] = (
          (route.config.middlewares ?? []) as NamedMiddlewareDef<
            Record<string, unknown>,
            Record<string, unknown>
          >[]
        ).map((mw) => ({
          name: mw.name,
          handler: mw.handler,
          resolvedInject: {},
        }));
        const entry: RouteEntry = {
          handler: route.config.handler,
          options: options ?? {},
          services: resolvedServices,
          middlewares: routeMiddlewares,
          paramsSchema: route.config.params as SchemaLike | undefined,
          bodySchema: route.config.body as SchemaLike | undefined,
          querySchema: route.config.query as SchemaLike | undefined,
          headersSchema: route.config.headers as SchemaLike | undefined,
          responseSchema: route.config.response as SchemaLike | undefined,
          errorsSchema: route.config.errors as unknown as Record<number, SchemaLike> | undefined,
        };
        trie.add(route.method, fullPath, entry);
      }
    }
  }
}

export function buildHandler(
  config: AppConfig,
  registrations: ModuleRegistration[],
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  globalMiddlewares: NamedMiddlewareDef<any, any>[],
): (request: Request) => Promise<Response> {
  const trie = new Trie<RouteEntry>();
  const basePath = config.basePath ?? '';
  const resolvedMiddlewares = resolveMiddlewares(globalMiddlewares);
  const serviceMap = resolveServices(registrations);

  registerRoutes(trie, basePath, registrations, serviceMap);

  return async (request: Request): Promise<Response> => {
    try {
      if (config.cors) {
        const corsResponse = handleCors(config.cors, request);
        if (corsResponse) return corsResponse;
      }

      const parsed = parseRequest(request);
      const match = trie.match(parsed.method, parsed.path);

      if (!match) {
        const allowed = trie.getAllowedMethods(parsed.path);
        if (allowed.length > 0) {
          return createJsonResponse(
            { error: 'MethodNotAllowed', message: 'Method Not Allowed', statusCode: 405 },
            405,
            { allow: allowed.join(', ') },
          );
        }
        return createJsonResponse(
          { error: 'NotFound', message: 'Not Found', statusCode: 404 },
          404,
        );
      }

      const body = await parseBody(request);

      const raw = {
        request: parsed.raw,
        method: parsed.method,
        url: parsed.raw.url,
        headers: parsed.raw.headers,
      };

      const requestCtx: Record<string, unknown> = {
        params: match.params,
        body,
        query: parsed.query,
        headers: parsed.headers,
        raw,
      };

      const middlewareState = await runMiddlewareChain(resolvedMiddlewares, requestCtx);

      const entry = match.handler;

      // Run route-level middlewares after global ones
      if (entry.middlewares.length > 0) {
        const routeCtx = { ...requestCtx, ...middlewareState };
        const routeState = await runMiddlewareChain(entry.middlewares, routeCtx);
        Object.assign(middlewareState, routeState);
      }

      // Validate schemas if provided
      const validatedParams = entry.paramsSchema
        ? validateSchema(entry.paramsSchema, match.params, 'params')
        : match.params;
      const validatedBody = entry.bodySchema
        ? validateSchema(entry.bodySchema, body, 'body')
        : body;
      const validatedQuery = entry.querySchema
        ? validateSchema(entry.querySchema, parsed.query, 'query')
        : parsed.query;
      const validatedHeaders = entry.headersSchema
        ? validateSchema(entry.headersSchema, parsed.headers, 'headers')
        : parsed.headers;

      const ctx = buildCtx({
        params: validatedParams as Record<string, unknown>,
        body: validatedBody,
        query: validatedQuery as Record<string, string>,
        headers: validatedHeaders as Record<string, string>,
        raw,
        middlewareState,
        services: entry.services,
        options: entry.options,
        env: {},
      });

      const result = await entry.handler(ctx);

      // Handle Result type (errors-as-values pattern)
      if (isResult(result)) {
        if (isOk(result)) {
          // Ok result - extract data and validate against response schema if enabled
          const data = result.data;
          if (config.validateResponses && entry.responseSchema) {
            try {
              entry.responseSchema.parse(data);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Response schema validation failed';
              console.warn(`[vertz] Response validation warning: ${message}`);
            }
          }
          return createResponseWithCors(data, 200, config, request);
        } else {
          // Err result - use error status and body
          const errorStatus = result.status;
          const errorBody = result.body;

          // Validate error response against error schema if enabled
          if (config.validateResponses && entry.errorsSchema) {
            const errorSchema = entry.errorsSchema[errorStatus];
            if (errorSchema) {
              try {
                errorSchema.parse(errorBody);
              } catch (error) {
                const message =
                  error instanceof Error
                    ? `Error schema validation failed for status ${errorStatus}: ${error.message}`
                    : `Error schema validation failed for status ${errorStatus}`;
                console.warn(`[vertz] Response validation warning: ${message}`);
              }
            }
          }
          return createResponseWithCors(errorBody, errorStatus, config, request);
        }
      }

      // Validate response against schema if enabled (backwards compat for plain objects)
      if (config.validateResponses && entry.responseSchema) {
        try {
          entry.responseSchema.parse(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Response schema validation failed';
          console.warn(`[vertz] Response validation warning: ${message}`);
        }
      }

      const response =
        result === undefined ? new Response(null, { status: 204 }) : createJsonResponse(result);

      if (config.cors) {
        return applyCorsHeaders(config.cors, request, response);
      }

      return response;
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}
