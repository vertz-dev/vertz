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

function resolveEntityBasePath(server: AppBuilder, entityName: string): string {
  const routes = server.router.routes;
  // Entity list route pattern: GET <prefix>/<entityName>
  const listRoute = routes.find((r) => r.method === 'GET' && r.path.endsWith(`/${entityName}`));
  if (listRoute) return listRoute.path;
  // Fallback: convention-based
  return `/api/${entityName}`;
}

function resolveServiceBasePath(server: AppBuilder, serviceName: string): string {
  const routes = server.router.routes;
  // Service action route pattern: POST <prefix>/<serviceName>/<actionName>
  const serviceRoute = routes.find(
    (r) => r.method === 'POST' && r.path.includes(`/${serviceName}/`),
  );
  if (serviceRoute) {
    // Extract base: /api/domain/serviceName/action → /api/domain/serviceName
    const lastSlash = serviceRoute.path.lastIndexOf('/');
    return serviceRoute.path.slice(0, lastSlash);
  }
  // Fallback: convention-based
  return `/api/${serviceName}`;
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
// Request dispatch
// ---------------------------------------------------------------------------

async function dispatch<T>(
  server: AppBuilder,
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

  const raw = await server.handler(request);
  return parseResponse<T>(raw);
}

// ---------------------------------------------------------------------------
// Entity proxy factory
// ---------------------------------------------------------------------------

function createEntityProxy<TModel extends ModelDef>(
  server: AppBuilder,
  entityDef: EntityDefinition,
  defaultHeaders: Record<string, string>,
): EntityTestProxy<TModel> {
  const basePath = resolveEntityBasePath(server, entityDef.name);

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
      return dispatch(server, 'GET', path, { ...defaultHeaders, ...options?.headers });
    },

    get(id: string, options?: EntityRequestOptions) {
      return dispatch(server, 'GET', `${basePath}/${id}`, {
        ...defaultHeaders,
        ...options?.headers,
      });
    },

    create(body: unknown, options?: EntityRequestOptions) {
      return dispatch(
        server,
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
        server,
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
      return dispatch(server, 'DELETE', `${basePath}/${id}`, {
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
  server: AppBuilder,
  serviceDef: TDef,
  defaultHeaders: Record<string, string>,
): ServiceTestProxy<TDef> {
  const basePath = resolveServiceBasePath(server, serviceDef.name);
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
        const actionPath = action?.path ?? `/${prop}`;
        const fullPath = `${basePath}${actionPath}`;

        return dispatch(
          server,
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

  function makeClient(headers: Record<string, string>): TestClient {
    return {
      entity<TModel extends ModelDef>(def: EntityDefinition<TModel>) {
        return createEntityProxy<TModel>(server, def, headers);
      },

      service<TDef extends ServiceDefinition>(def: TDef) {
        return createServiceProxy(server, def, headers);
      },

      withHeaders(newHeaders: Record<string, string>) {
        return makeClient({ ...headers, ...newHeaders });
      },

      get(path: string, opts?: RequestOptions) {
        return dispatch(server, 'GET', path, headers, opts);
      },
      post(path: string, opts?: RequestOptions) {
        return dispatch(server, 'POST', path, headers, opts);
      },
      put(path: string, opts?: RequestOptions) {
        return dispatch(server, 'PUT', path, headers, opts);
      },
      patch(path: string, opts?: RequestOptions) {
        return dispatch(server, 'PATCH', path, headers, opts);
      },
      delete(path: string, opts?: RequestOptions) {
        return dispatch(server, 'DELETE', path, headers, opts);
      },
      head(path: string, opts?: RequestOptions) {
        return dispatch(server, 'HEAD', path, headers, opts);
      },
    };
  }

  return makeClient(defaultHeaders);
}
