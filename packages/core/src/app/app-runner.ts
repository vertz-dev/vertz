import type { AppConfig } from '../types/app';
import type { NamedModule } from '../module/module';
import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedServiceDef } from '../module/service';
import { Trie } from '../router/trie';
import { parseRequest, parseBody } from '../server/request-utils';
import { createJsonResponse, createErrorResponse } from '../server/response-utils';
import { handleCors, applyCorsHeaders } from '../server/cors';
import { runMiddlewareChain, type ResolvedMiddleware } from '../middleware/middleware-runner';
import { buildCtx } from '../context/ctx-builder';

interface ModuleRegistration {
  module: NamedModule;
  options?: Record<string, unknown>;
}

interface RouteEntry {
  handler: (ctx: any) => any;
  options: Record<string, unknown>;
  services: Record<string, unknown>;
}

export function buildHandler(
  config: AppConfig,
  registrations: ModuleRegistration[],
  globalMiddlewares: NamedMiddlewareDef[],
): (request: Request) => Promise<Response> {
  const trie = new Trie();
  const basePath = config.basePath ?? '';

  const resolvedMiddlewares: ResolvedMiddleware[] = globalMiddlewares.map((mw) => ({
    name: mw.name,
    handler: mw.handler,
    resolvedInject: {},
  }));

  const serviceMap = new Map<NamedServiceDef, unknown>();

  for (const { module } of registrations) {
    for (const service of module.services) {
      if (!serviceMap.has(service)) {
        const methods = service.methods({}, undefined);
        serviceMap.set(service, methods);
      }
    }
  }

  for (const { module, options } of registrations) {
    for (const router of module.routers) {
      const resolvedServices: Record<string, unknown> = {};
      if (router.inject) {
        for (const [name, serviceDef] of Object.entries(router.inject)) {
          const methods = serviceMap.get(serviceDef as NamedServiceDef);
          if (methods) resolvedServices[name] = methods;
        }
      }

      for (const route of router.routes) {
        const fullPath = basePath + router.prefix + route.path;
        const entry: RouteEntry = {
          handler: route.config.handler,
          options: options ?? {},
          services: resolvedServices,
        };
        trie.add(route.method, fullPath, entry as any);
      }
    }
  }

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

      const entry = match.handler as unknown as RouteEntry;

      const ctx = buildCtx({
        params: match.params,
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
      let response = result === undefined
        ? new Response(null, { status: 204 })
        : createJsonResponse(result);

      if (config.cors) {
        response = applyCorsHeaders(config.cors, request, response);
      }

      return response;
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}
