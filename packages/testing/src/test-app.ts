import type { NamedMiddlewareDef } from '@vertz/core/src/middleware/middleware-def';
import type { NamedModule } from '@vertz/core/src/module/module';
import type { NamedServiceDef } from '@vertz/core/src/module/service';
import { Trie } from '@vertz/core/src/router/trie';
import { parseRequest, parseBody } from '@vertz/core/src/server/request-utils';
import { createJsonResponse, createErrorResponse } from '@vertz/core/src/server/response-utils';
import { buildCtx } from '@vertz/core/src/context/ctx-builder';
import { runMiddlewareChain, type ResolvedMiddleware } from '@vertz/core/src/middleware/middleware-runner';

interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  ok: boolean;
}

interface TestRequestBuilder extends PromiseLike<TestResponse> {
  mockMiddleware(middleware: NamedMiddlewareDef, result: Record<string, unknown>): TestRequestBuilder;
}

export interface TestApp {
  register(module: NamedModule, options?: Record<string, unknown>): TestApp;
  mock(service: NamedServiceDef, impl: unknown): TestApp;
  mockMiddleware(middleware: NamedMiddlewareDef, result: Record<string, unknown>): TestApp;
  env(vars: Record<string, unknown>): TestApp;
  get(path: string, options?: { params?: Record<string, string>; headers?: Record<string, string> }): TestRequestBuilder;
  post(path: string, options?: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> }): TestRequestBuilder;
}

interface RouteEntry {
  handler: (ctx: any) => any;
  options: Record<string, unknown>;
  services: Record<string, unknown>;
}

export function createTestApp(): TestApp {
  const serviceMocks = new Map<NamedServiceDef, unknown>();
  const middlewareMocks = new Map<NamedMiddlewareDef, Record<string, unknown>>();
  const registrations: { module: NamedModule; options?: Record<string, unknown> }[] = [];
  let envOverrides: Record<string, unknown> = {};

  function buildHandler(
    perRequestMiddlewareMocks: Map<NamedMiddlewareDef, Record<string, unknown>>,
  ): (request: Request) => Promise<Response> {
    const trie = new Trie();

    // Resolve services — use mocks when available
    const serviceMap = new Map<NamedServiceDef, unknown>();
    for (const { module } of registrations) {
      for (const service of module.services) {
        if (serviceMocks.has(service)) {
          serviceMap.set(service, serviceMocks.get(service));
        } else if (!serviceMap.has(service)) {
          serviceMap.set(service, service.methods({}, undefined));
        }
      }
    }

    // Register routes
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
          const fullPath = router.prefix + route.path;
          const entry: RouteEntry = {
            handler: route.config.handler,
            options: options ?? {},
            services: resolvedServices,
          };
          trie.add(route.method, fullPath, entry as any);
        }
      }
    }

    // Merge middleware mocks: app-level first, per-request overrides win
    const effectiveMocks = new Map(middlewareMocks);
    for (const [mw, result] of perRequestMiddlewareMocks) {
      effectiveMocks.set(mw, result);
    }

    return async (request: Request): Promise<Response> => {
      try {
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
          params: match.params, body, query: parsed.query,
          headers: parsed.headers, raw,
        };

        // Build middleware chain — mocked middlewares return their mock result directly
        const resolvedMiddlewares: ResolvedMiddleware[] = [];
        for (const [mw, mockResult] of effectiveMocks) {
          resolvedMiddlewares.push({
            name: mw.name,
            handler: () => mockResult,
            resolvedInject: {},
          });
        }

        const middlewareState = await runMiddlewareChain(resolvedMiddlewares, requestCtx);

        const entry = match.handler as unknown as RouteEntry;

        const ctx = buildCtx({
          params: match.params, body, query: parsed.query,
          headers: parsed.headers, raw, middlewareState,
          services: entry.services, options: entry.options, env: envOverrides,
        });

        const result = await entry.handler(ctx);
        return result === undefined
          ? new Response(null, { status: 204 })
          : createJsonResponse(result);
      } catch (error) {
        return createErrorResponse(error);
      }
    };
  }

  async function executeRequest(
    method: string,
    path: string,
    body: unknown | undefined,
    customHeaders: Record<string, string> | undefined,
    perRequestMiddlewareMocks: Map<NamedMiddlewareDef, Record<string, unknown>>,
  ): Promise<TestResponse> {
    const handler = buildHandler(perRequestMiddlewareMocks);
    const init: RequestInit = { method };
    const headers: Record<string, string> = { ...customHeaders };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    if (Object.keys(headers).length > 0) {
      init.headers = headers;
    }
    const request = new Request(`http://localhost${path}`, init);
    const response = await handler(request);
    const responseBody = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : null;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      status: response.status,
      body: responseBody,
      headers: responseHeaders,
      ok: response.ok,
    };
  }

  function createRequestBuilder(method: string, path: string, body?: unknown, headers?: Record<string, string>): TestRequestBuilder {
    const perRequestMocks = new Map<NamedMiddlewareDef, Record<string, unknown>>();

    const requestBuilder: TestRequestBuilder = {
      mockMiddleware(middleware, result) {
        perRequestMocks.set(middleware, result);
        return requestBuilder;
      },
      then(onfulfilled, onrejected) {
        return executeRequest(method, path, body, headers, perRequestMocks).then(onfulfilled, onrejected);
      },
    };

    return requestBuilder;
  }

  const builder: TestApp = {
    register(module, options) {
      registrations.push({ module, options });
      return builder;
    },
    mock(service, impl) {
      serviceMocks.set(service, impl);
      return builder;
    },
    mockMiddleware(middleware, result) {
      middlewareMocks.set(middleware, result);
      return builder;
    },
    env(vars) {
      envOverrides = vars;
      return builder;
    },
    get(path, options) {
      return createRequestBuilder('GET', path, undefined, options?.headers);
    },
    post(path, options) {
      return createRequestBuilder('POST', path, options?.body, options?.headers);
    },
  };

  return builder;
}
