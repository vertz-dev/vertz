import {
  buildCtx,
  createErrorResponse,
  createJsonResponse,
  parseBody,
  parseRequest,
  runMiddlewareChain,
  Trie,
} from '@vertz/core/internals';
import { BadRequestException } from '@vertz/server';

function validateSchema(schema, value, label) {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    const message = error instanceof Error ? error.message : `Invalid ${label}`;
    throw new BadRequestException(message);
  }
}
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
export function createTestApp() {
  const serviceMocks = new Map();
  const middlewareMocks = new Map();
  const registrations = [];
  let envOverrides = {};
  function buildHandler(perRequest) {
    const trie = new Trie();
    // Resolve services: real -> app-level -> per-request (last wins)
    const realServices = new Map();
    for (const { module, options } of registrations) {
      for (const service of module.services) {
        if (!realServices.has(service)) {
          // Parse options from module registration against service schema
          let parsedOptions = {};
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
          // For test apps, env is empty
          const env = {};
          realServices.set(service, service.methods({}, undefined, parsedOptions, env));
        }
      }
    }
    const serviceMap = new Map([...realServices, ...serviceMocks, ...perRequest.services]);
    for (const { module, options } of registrations) {
      for (const router of module.routers) {
        const resolvedServices = {};
        if (router.inject) {
          for (const [name, serviceDef] of Object.entries(router.inject)) {
            resolvedServices[name] = serviceMap.get(serviceDef);
          }
        }
        for (const route of router.routes) {
          const fullPath = router.prefix + route.path;
          const entry = {
            handler: route.config.handler,
            options: options ?? {},
            services: resolvedServices,
            responseSchema: route.config.response,
            bodySchema: route.config.body,
            querySchema: route.config.query,
            headersSchema: route.config.headers,
          };
          trie.add(route.method, fullPath, entry);
        }
      }
    }
    const effectiveMiddlewareMocks = new Map([...middlewareMocks, ...perRequest.middlewares]);
    return async (request) => {
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
        const resolvedMiddlewares = [...effectiveMiddlewareMocks].map(([mw, mockResult]) => ({
          name: mw.name,
          handler: () => mockResult,
          resolvedInject: {},
        }));
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
          query: validatedQuery,
          headers: validatedHeaders,
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
  async function executeRequest(method, path, options, perRequest) {
    const handler = buildHandler(perRequest);
    const { body, headers: customHeaders } = options ?? {};
    const headers = { ...customHeaders };
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
  function createRequestBuilder(method, path, options) {
    const perRequest = {
      services: new Map(),
      middlewares: new Map(),
    };
    const builder = {
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
      (path, options) => createRequestBuilder(m, path, options),
    ]),
  );
  const app = {
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
class ResponseValidationError extends Error {
  constructor(message) {
    super(`Response validation failed: ${message}`);
    this.name = 'ResponseValidationError';
  }
}
//# sourceMappingURL=test-app.js.map
