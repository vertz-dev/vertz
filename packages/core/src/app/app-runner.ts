import type { AppConfig } from '../types/app';
import type { NamedModule } from '../module/module';
import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import { Trie } from '../router/trie';
import { parseRequest, parseBody } from '../server/request-utils';
import { createJsonResponse, createErrorResponse } from '../server/response-utils';
import { handleCors, applyCorsHeaders } from '../server/cors';
import { runMiddlewareChain, type ResolvedMiddleware } from '../middleware/middleware-runner';

interface ModuleRegistration {
  module: NamedModule;
  options?: Record<string, unknown>;
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

  for (const { module } of registrations) {
    for (const router of module.routers) {
      for (const route of router.routes) {
        const fullPath = basePath + router.prefix + route.path;
        trie.add(route.method, fullPath, route.config.handler);
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

      const requestCtx: Record<string, unknown> = {
        params: match.params,
        body,
        query: parsed.query,
        headers: parsed.headers,
        raw: {
          request: parsed.raw,
          method: parsed.method,
          url: parsed.raw.url,
          headers: parsed.raw.headers,
        },
      };

      const middlewareState = await runMiddlewareChain(resolvedMiddlewares, requestCtx);

      const ctx: Record<string, unknown> = {
        ...requestCtx,
        ...middlewareState,
      };

      const result = await match.handler(ctx);
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
