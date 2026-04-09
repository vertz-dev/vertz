import type { ModelDef } from '@vertz/db';
import type { AppBuilder, EntityDefinition, ServiceDefinition } from '@vertz/server';
import type {
  EntityListOptions,
  EntityRequestOptions,
  EntityTestProxy,
  RequestOptions,
  ServiceCallOptions,
  ServiceTestProxy,
  TestClient,
  TestClientOptions,
  TestResponse,
} from './test-client-types';

// ---------------------------------------------------------------------------
// Path resolution — discover entity/service routes from server.router.routes
// ---------------------------------------------------------------------------

/**
 * Matches a path segment boundary: the entity name must be preceded by '/'
 * and followed by end-of-string or another '/'.
 * E.g. for entity "todos": matches "/api/todos" but not "/api/all-todos".
 */
function resolveEntityBasePath(server: AppBuilder, entityName: string): string {
  const routes = server.router.routes;
  const suffix = `/${entityName}`;
  const listRoute = routes.find(
    (r) => r.method === 'GET' && (r.path === suffix || r.path.endsWith(suffix)),
  );
  if (listRoute) return listRoute.path;
  return `/api/${entityName}`;
}

/**
 * Matches service routes by looking for "/<serviceName>/" or "/<serviceName>" as
 * a segment boundary. Searches all HTTP methods (not just POST) so GET-only
 * services are resolved correctly.
 * E.g. for service "health": matches "/api/health/check" but not "/api/health-check/action".
 */
function resolveServiceBasePath(server: AppBuilder, serviceName: string): string {
  const routes = server.router.routes;
  // Match routes containing /{serviceName}/ or ending with /{serviceName}
  const escaped = serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const segmentPattern = new RegExp(`/${escaped}(/|$)`);
  const serviceRoute = routes.find((r) => segmentPattern.test(r.path));
  if (serviceRoute) {
    const idx = serviceRoute.path.indexOf(`/${serviceName}`);
    return serviceRoute.path.slice(0, idx + 1 + serviceName.length);
  }
  return `/api/${serviceName}`;
}

/**
 * Resolve the full request path for a service action by matching against
 * registered routes. Handles custom action paths correctly.
 */
function resolveActionPath(
  server: AppBuilder,
  actionName: string,
  actionDef: { method?: string; path?: string } | undefined,
  basePath: string,
): string {
  if (!actionDef?.path) {
    // Default path: basePath + /actionName
    return `${basePath}/${actionName}`;
  }
  // Custom path: find the matching registered route by exact path
  const method = (actionDef.method ?? 'POST').toUpperCase();
  const customSuffix = actionDef.path.replace(/^\/+/, '');
  const prefix = basePath.slice(0, basePath.lastIndexOf('/'));
  const expectedPath = `${prefix}/${customSuffix}`;
  const routes = server.router.routes;
  const matchedRoute = routes.find((r) => r.method === method && r.path === expectedPath);
  if (matchedRoute) {
    return matchedRoute.path;
  }
  // Fallback: basePath + custom path
  return `${basePath}${actionDef.path.startsWith('/') ? actionDef.path : `/${actionDef.path}`}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

async function parseResponse<T>(raw: Response): Promise<TestResponse<T>> {
  const status = raw.status;
  const ok = raw.ok;
  const headers: Record<string, string> = {};
  raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: unknown;
  const contentType = raw.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    body = await raw.json();
  } else if (status === 204 || raw.headers.get('content-length') === '0') {
    body = null;
  } else {
    // Try JSON, fall back to null
    try {
      body = await raw.json();
    } catch {
      body = null;
    }
  }

  return { ok, status, body, headers, raw } as TestResponse<T>;
}

// ---------------------------------------------------------------------------
// Request handler resolution — prefer requestHandler (auth-enabled) over handler
// ---------------------------------------------------------------------------

function getRequestHandler(server: AppBuilder): (request: Request) => Promise<Response> {
  if ('requestHandler' in server && typeof server.requestHandler === 'function') {
    return server.requestHandler as (request: Request) => Promise<Response>;
  }
  return server.handler;
}

// ---------------------------------------------------------------------------
// Request dispatch
// ---------------------------------------------------------------------------

async function dispatch<T>(
  handler: (request: Request) => Promise<Response>,
  method: string,
  path: string,
  defaultHeaders: Record<string, string>,
  options?: RequestOptions,
): Promise<TestResponse<T>> {
  const mergedHeaders: Record<string, string> = { ...defaultHeaders, ...options?.headers };

  if (options?.body !== undefined) {
    mergedHeaders['content-type'] = 'application/json';
  }

  const request = new Request(`http://localhost${path}`, {
    method,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers: mergedHeaders,
  });

  const raw = await handler(request);
  return parseResponse<T>(raw);
}

// ---------------------------------------------------------------------------
// Entity proxy factory
// ---------------------------------------------------------------------------

function createEntityProxy<TModel extends ModelDef>(
  handler: (request: Request) => Promise<Response>,
  basePath: string,
  defaultHeaders: Record<string, string>,
): EntityTestProxy<TModel> {
  return {
    list(options?: EntityListOptions) {
      const params = new URLSearchParams();
      if (options?.where) params.set('where', JSON.stringify(options.where));
      if (options?.orderBy) params.set('orderBy', JSON.stringify(options.orderBy));
      if (options?.limit !== undefined) params.set('limit', String(options.limit));
      if (options?.after) params.set('after', options.after);
      if (options?.select) params.set('select', JSON.stringify(options.select));
      if (options?.include) params.set('include', JSON.stringify(options.include));
      const qs = params.toString();
      const path = qs ? `${basePath}?${qs}` : basePath;
      return dispatch(handler, 'GET', path, { ...defaultHeaders, ...options?.headers });
    },

    get(id: string, options?: EntityRequestOptions) {
      return dispatch(handler, 'GET', `${basePath}/${id}`, {
        ...defaultHeaders,
        ...options?.headers,
      });
    },

    create(body: unknown, options?: EntityRequestOptions) {
      return dispatch(
        handler,
        'POST',
        basePath,
        { ...defaultHeaders, ...options?.headers },
        {
          body,
        },
      );
    },

    update(id: string, body: unknown, options?: EntityRequestOptions) {
      return dispatch(
        handler,
        'PATCH',
        `${basePath}/${id}`,
        {
          ...defaultHeaders,
          ...options?.headers,
        },
        { body },
      );
    },

    delete(id: string, options?: EntityRequestOptions) {
      return dispatch(handler, 'DELETE', `${basePath}/${id}`, {
        ...defaultHeaders,
        ...options?.headers,
      });
    },
  } as EntityTestProxy<TModel>;
}

// ---------------------------------------------------------------------------
// Service proxy factory
// ---------------------------------------------------------------------------

function createServiceProxy<TDef extends ServiceDefinition>(
  handler: (request: Request) => Promise<Response>,
  basePath: string,
  serviceDef: TDef,
  defaultHeaders: Record<string, string>,
  server: AppBuilder,
): ServiceTestProxy<TDef> {
  const actionNames = Object.keys(serviceDef.actions);

  return new Proxy({} as ServiceTestProxy<TDef>, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (!actionNames.includes(prop)) return undefined;

      return (...args: unknown[]) => {
        const action = serviceDef.actions[prop];
        const hasBody = action?.body !== undefined;

        let body: unknown;
        let options: ServiceCallOptions | undefined;

        if (hasBody) {
          // Action with body schema: (body, options?)
          body = args[0];
          options = args[1] as ServiceCallOptions | undefined;
        } else {
          // Action without body schema: (options?)
          options = args[0] as ServiceCallOptions | undefined;
        }

        const method = action?.method?.toUpperCase() ?? 'POST';
        const fullPath = resolveActionPath(server, prop, action, basePath);

        return dispatch(
          handler,
          method,
          fullPath,
          {
            ...defaultHeaders,
            ...options?.headers,
          },
          body !== undefined ? { body } : undefined,
        );
      };
    },
  });
}

// ---------------------------------------------------------------------------
// createTestClient
// ---------------------------------------------------------------------------

export function createTestClient(server: AppBuilder, options?: TestClientOptions): TestClient {
  const defaultHeaders = options?.defaultHeaders ?? {};
  const handler = getRequestHandler(server);

  function makeClient(headers: Record<string, string>): TestClient {
    return {
      entity<TModel extends ModelDef>(def: EntityDefinition<TModel>) {
        const basePath = resolveEntityBasePath(server, def.name);
        return createEntityProxy<TModel>(handler, basePath, headers);
      },

      service<TDef extends ServiceDefinition>(def: TDef) {
        const basePath = resolveServiceBasePath(server, def.name);
        return createServiceProxy(handler, basePath, def, headers, server);
      },

      withHeaders(newHeaders: Record<string, string>) {
        return makeClient({ ...headers, ...newHeaders });
      },

      get(path: string, opts?: RequestOptions) {
        return dispatch(handler, 'GET', path, headers, opts);
      },
      post(path: string, opts?: RequestOptions) {
        return dispatch(handler, 'POST', path, headers, opts);
      },
      put(path: string, opts?: RequestOptions) {
        return dispatch(handler, 'PUT', path, headers, opts);
      },
      patch(path: string, opts?: RequestOptions) {
        return dispatch(handler, 'PATCH', path, headers, opts);
      },
      delete(path: string, opts?: RequestOptions) {
        return dispatch(handler, 'DELETE', path, headers, opts);
      },
      head(path: string, opts?: RequestOptions) {
        return dispatch(handler, 'HEAD', path, headers, opts);
      },
    };
  }

  return makeClient(defaultHeaders);
}
