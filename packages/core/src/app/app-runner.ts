import { buildCtx } from '../context/ctx-builder';
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

export interface ModuleRegistration {
  module: NamedModule;
  options?: Record<string, unknown>;
}

interface RouteEntry {
  handler: (ctx: HandlerCtx) => unknown;
  options: Record<string, unknown>;
  services: Record<string, unknown>;
  paramsSchema?: { parse(value: unknown): unknown };
}

function resolveServices(registrations: ModuleRegistration[]): Map<NamedServiceDef, unknown> {
  const serviceMap = new Map<NamedServiceDef, unknown>();

  for (const { module } of registrations) {
    for (const service of module.services) {
      if (!serviceMap.has(service)) {
        serviceMap.set(service, service.methods({}, undefined));
      }
    }
  }

  return serviceMap;
}

function resolveMiddlewares(globalMiddlewares: NamedMiddlewareDef[]): ResolvedMiddleware[] {
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
        const entry: RouteEntry = {
          handler: route.config.handler,
          options: options ?? {},
          services: resolvedServices,
          paramsSchema: route.config.params as { parse(value: unknown): unknown } | undefined,
        };
        trie.add(route.method, fullPath, entry);
      }
    }
  }
}

export function buildHandler(
  config: AppConfig,
  registrations: ModuleRegistration[],
  globalMiddlewares: NamedMiddlewareDef[],
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

      // Validate params using schema if provided
      const validatedParams = entry.paramsSchema
        ? entry.paramsSchema.parse(match.params)
        : match.params;

      const ctx = buildCtx({
        params: validatedParams as Record<string, unknown>,
        body,
        query: parsed.query,
        headers: parsed.headers,
        raw,
        middlewareState,
        services: entry.services,
        options: entry.options,
        env: {},
      });

      const result = await entry.handler(ctx);
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
