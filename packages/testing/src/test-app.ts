import type { NamedMiddlewareDef } from '@vertz/core/src/middleware/middleware-def';
import type { ResolvedMiddleware } from '@vertz/core/src/middleware/middleware-runner';
import type { NamedModule } from '@vertz/core/src/module/module';
import type { NamedServiceDef } from '@vertz/core/src/module/service';

import { runMiddlewareChain } from '@vertz/core/src/middleware/middleware-runner';
import { buildCtx } from '@vertz/core/src/context/ctx-builder';
import { Trie } from '@vertz/core/src/router/trie';
import { parseRequest, parseBody } from '@vertz/core/src/server/request-utils';
import { createJsonResponse, createErrorResponse } from '@vertz/core/src/server/response-utils';

export interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  ok: boolean;
}

export interface TestRequestBuilder extends PromiseLike<TestResponse> {
  mockMiddleware(middleware: NamedMiddlewareDef, result: Record<string, unknown>): TestRequestBuilder;
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export interface TestApp {
  register(module: NamedModule, options?: Record<string, unknown>): TestApp;
  mock(service: NamedServiceDef, impl: unknown): TestApp;
  mockMiddleware(middleware: NamedMiddlewareDef, result: Record<string, unknown>): TestApp;
  env(vars: Record<string, unknown>): TestApp;
  get(path: string, options?: RequestOptions): TestRequestBuilder;
  post(path: string, options?: RequestOptions): TestRequestBuilder;
  put(path: string, options?: RequestOptions): TestRequestBuilder;
  patch(path: string, options?: RequestOptions): TestRequestBuilder;
  delete(path: string, options?: RequestOptions): TestRequestBuilder;
  head(path: string, options?: RequestOptions): TestRequestBuilder;
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

    // Merge middleware mocks: per-request overrides win over app-level
    const effectiveMocks = new Map([...middlewareMocks, ...perRequestMiddlewareMocks]);

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

        const shared = {
          params: match.params,
          body,
          query: parsed.query,
          headers: parsed.headers,
          raw,
        };

        const resolvedMiddlewares: ResolvedMiddleware[] = [...effectiveMocks].map(
          ([mw, mockResult]) => ({
            name: mw.name,
            handler: () => mockResult,
            resolvedInject: {},
          }),
        );

        const middlewareState = await runMiddlewareChain(resolvedMiddlewares, shared);
        const entry = match.handler as unknown as RouteEntry;

        const ctx = buildCtx({
          ...shared,
          middlewareState,
          services: entry.services,
          options: entry.options,
          env: envOverrides,
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
    options: RequestOptions | undefined,
    perRequestMiddlewareMocks: Map<NamedMiddlewareDef, Record<string, unknown>>,
  ): Promise<TestResponse> {
    const handler = buildHandler(perRequestMiddlewareMocks);

    const { body, headers: customHeaders } = options ?? {};
    const headers: Record<string, string> = { ...customHeaders };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const request = new Request(`http://localhost${path}`, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });

    const response = await handler(request);
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const responseBody = isJson ? await response.json() : null;

    return {
      status: response.status,
      body: responseBody,
      headers: Object.fromEntries(response.headers),
      ok: response.ok,
    };
  }

  function createRequestBuilder(method: string, path: string, options?: RequestOptions): TestRequestBuilder {
    const perRequestMocks = new Map<NamedMiddlewareDef, Record<string, unknown>>();

    const requestBuilder: TestRequestBuilder = {
      mockMiddleware(middleware, result) {
        perRequestMocks.set(middleware, result);
        return requestBuilder;
      },
      then(onfulfilled, onrejected) {
        return executeRequest(method, path, options, perRequestMocks).then(onfulfilled, onrejected);
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
      return createRequestBuilder('GET', path, options);
    },
    post(path, options) {
      return createRequestBuilder('POST', path, options);
    },
    put(path, options) {
      return createRequestBuilder('PUT', path, options);
    },
    patch(path, options) {
      return createRequestBuilder('PATCH', path, options);
    },
    delete(path, options) {
      return createRequestBuilder('DELETE', path, options);
    },
    head(path, options) {
      return createRequestBuilder('HEAD', path, options);
    },
  };

  return builder;
}
