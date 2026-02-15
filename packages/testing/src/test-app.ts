import type { ResolvedMiddleware } from '@vertz/core/internals';
import {
  buildCtx,
  createErrorResponse,
  createJsonResponse,
  parseBody,
  parseRequest,
  runMiddlewareChain,
  Trie,
} from '@vertz/core/internals';
import {
  BadRequestException,
  type HandlerCtx,
  type NamedMiddlewareDef,
  type NamedModule,
  type NamedServiceDef,
} from '@vertz/server';

import type { DeepPartial } from './types';

class ResponseValidationError extends Error {
  constructor(message: string) {
    super(`Response validation failed: ${message}`);
    this.name = 'ResponseValidationError';
  }
}

export interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  ok: boolean;
}

export interface TestRequestBuilder extends PromiseLike<TestResponse> {
  mock<TDeps, TState, TMethods>(
    service: NamedServiceDef<TDeps, TState, TMethods>,
    impl: DeepPartial<TMethods>,
  ): TestRequestBuilder;
  mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
    middleware: NamedMiddlewareDef<TReq, TProv>,
    result: TProv,
  ): TestRequestBuilder;
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export interface TestApp {
  register(module: NamedModule, options?: Record<string, unknown>): TestApp;
  mock<TDeps, TState, TMethods>(
    service: NamedServiceDef<TDeps, TState, TMethods>,
    impl: DeepPartial<TMethods>,
  ): TestApp;
  mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
    middleware: NamedMiddlewareDef<TReq, TProv>,
    result: TProv,
  ): TestApp;
  env(vars: Record<string, unknown>): TestApp;
  get(path: string, options?: RequestOptions): TestRequestBuilder;
  post(path: string, options?: RequestOptions): TestRequestBuilder;
  put(path: string, options?: RequestOptions): TestRequestBuilder;
  patch(path: string, options?: RequestOptions): TestRequestBuilder;
  delete(path: string, options?: RequestOptions): TestRequestBuilder;
  head(path: string, options?: RequestOptions): TestRequestBuilder;
}

// Use `object` key type since we compare service/middleware defs by reference identity
// Use `{ name: string }` key type because NamedMiddlewareDef is invariant
// in its generic params (due to Schema<TReq>), and we only need the name.
type MiddlewareKey = { name: string };

interface PerRequestMocks {
  services: Map<object, unknown>;
  middlewares: Map<MiddlewareKey, Record<string, unknown>>;
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
  responseSchema?: { safeParse(value: unknown): { success: boolean; error?: { message: string } } };
  bodySchema?: SchemaLike;
  querySchema?: SchemaLike;
  headersSchema?: SchemaLike;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

export function createTestApp(): TestApp {
  const serviceMocks = new Map<object, unknown>();
  const middlewareMocks = new Map<MiddlewareKey, Record<string, unknown>>();
  const registrations: { module: NamedModule; options?: Record<string, unknown> }[] = [];
  let envOverrides: Record<string, unknown> = {};

  function buildHandler(perRequest: PerRequestMocks): (request: Request) => Promise<Response> {
    const trie = new Trie<RouteEntry>();

    // Resolve services: real -> app-level -> per-request (last wins)
    const realServices = new Map<object, unknown>();
    for (const { module } of registrations) {
      for (const service of module.services) {
        if (!realServices.has(service)) {
          realServices.set(service, service.methods({}, undefined));
        }
      }
    }
    const serviceMap = new Map([...realServices, ...serviceMocks, ...perRequest.services]);

    for (const { module, options } of registrations) {
      for (const router of module.routers) {
        const resolvedServices: Record<string, unknown> = {};
        if (router.inject) {
          for (const [name, serviceDef] of Object.entries(router.inject)) {
            resolvedServices[name] = serviceMap.get(serviceDef as NamedServiceDef);
          }
        }

        for (const route of router.routes) {
          const fullPath = router.prefix + route.path;
          const entry: RouteEntry = {
            handler: route.config.handler,
            options: options ?? {},
            services: resolvedServices,
            responseSchema: route.config.response as RouteEntry['responseSchema'],
            bodySchema: route.config.body as SchemaLike | undefined,
            querySchema: route.config.query as SchemaLike | undefined,
            headersSchema: route.config.headers as SchemaLike | undefined,
          };
          trie.add(route.method, fullPath, entry);
        }
      }
    }

    const effectiveMiddlewareMocks = new Map([...middlewareMocks, ...perRequest.middlewares]);

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

        const resolvedMiddlewares: ResolvedMiddleware[] = [...effectiveMiddlewareMocks].map(
          ([mw, mockResult]) => ({
            name: mw.name,
            handler: () => mockResult,
            resolvedInject: {},
          }),
        );

        const middlewareState = await runMiddlewareChain(resolvedMiddlewares, shared);
        const entry = match.handler;

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
          params: match.params,
          body: validatedBody,
          query: validatedQuery as Record<string, unknown>,
          headers: validatedHeaders as Record<string, string>,
          raw,
          middlewareState,
          services: entry.services,
          options: entry.options,
          env: envOverrides,
        });

        const result = await entry.handler(ctx);

        if (entry.responseSchema) {
          const validation = entry.responseSchema.safeParse(result);
          if (!validation.success) {
            throw new ResponseValidationError(
              validation.error?.message ?? 'Unknown validation error',
            );
          }
        }

        return result === undefined
          ? new Response(null, { status: 204 })
          : createJsonResponse(result);
      } catch (error) {
        if (error instanceof ResponseValidationError) throw error;
        return createErrorResponse(error);
      }
    };
  }

  async function executeRequest(
    method: string,
    path: string,
    options: RequestOptions | undefined,
    perRequest: PerRequestMocks,
  ): Promise<TestResponse> {
    const handler = buildHandler(perRequest);

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

  function createRequestBuilder(
    method: string,
    path: string,
    options?: RequestOptions,
  ): TestRequestBuilder {
    const perRequest: PerRequestMocks = {
      services: new Map<NamedServiceDef, unknown>(),
      middlewares: new Map<NamedMiddlewareDef, Record<string, unknown>>(),
    };

    const builder: TestRequestBuilder = {
      mock(service, impl) {
        perRequest.services.set(service, impl);
        return builder;
      },
      mockMiddleware(middleware, result) {
        perRequest.middlewares.set(middleware, result);
        return builder;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike for await support
      then(onfulfilled, onrejected) {
        return executeRequest(method, path, options, perRequest).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  const httpMethods = Object.fromEntries(
    HTTP_METHODS.map((m) => [
      m.toLowerCase(),
      (path: string, options?: RequestOptions) => createRequestBuilder(m, path, options),
    ]),
  ) as Pick<TestApp, 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head'>;

  const app: TestApp = {
    register(module, options) {
      registrations.push({ module, options });
      return app;
    },
    mock(service, impl) {
      serviceMocks.set(service, impl);
      return app;
    },
    mockMiddleware(middleware, result) {
      middlewareMocks.set(middleware, result);
      return app;
    },
    env(vars) {
      envOverrides = vars;
      return app;
    },
    ...httpMethods,
  };

  return app;
}
