import type { HandlerCtx } from '../types/context';
import type { RouterDef } from '../types/module';

// Helper type to infer output from schema
type InferOutput<T> = T extends { _output: infer O }
  ? O
  : T extends { parse(v: unknown): infer P }
    ? P
    : unknown;

// Compute typed context from schemas
type TypedHandlerCtx<
  TParams = unknown,
  TQuery = unknown,
  THeaders = unknown,
  TBody = unknown,
> = Omit<HandlerCtx, 'params' | 'query' | 'headers' | 'body'> & {
  params: TParams;
  query: TQuery;
  headers: THeaders;
  body: TBody;
};

export interface RouteConfig<
  TParams = unknown,
  TQuery = unknown,
  THeaders = unknown,
  TBody = unknown,
> {
  params?: TParams;
  body?: TBody;
  query?: TQuery;
  response?: unknown;
  headers?: THeaders;
  middlewares?: unknown[];
  handler: (
    ctx: TypedHandlerCtx<
      InferOutput<TParams>,
      InferOutput<TQuery>,
      InferOutput<THeaders>,
      InferOutput<TBody>
    >,
  ) => unknown;
}

export interface Route {
  method: string;
  path: string;
  config: RouteConfig<unknown, unknown, unknown, unknown>;
}

type HttpMethodFn = <TParams, TQuery, THeaders, TBody>(
  path: `/${string}`,
  config: RouteConfig<TParams, TQuery, THeaders, TBody>,
) => NamedRouterDef;

export interface NamedRouterDef extends RouterDef {
  moduleName: string;
  routes: Route[];
  get: HttpMethodFn;
  post: HttpMethodFn;
  put: HttpMethodFn;
  patch: HttpMethodFn;
  delete: HttpMethodFn;
  head: HttpMethodFn;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;

export function createRouterDef(moduleName: string, config: RouterDef): NamedRouterDef {
  const routes: Route[] = [];

  function addRoute(method: string, path: string, routeConfig: RouteConfig): NamedRouterDef {
    if (!path.startsWith('/')) {
      throw new Error(`Route path must start with '/', got '${path}'`);
    }
    routes.push({ method, path, config: routeConfig });
    return router;
  }

  const router = {
    ...config,
    moduleName,
    routes,
  } as NamedRouterDef;

  for (const method of HTTP_METHODS) {
    router[method] = (path, cfg) => addRoute(method.toUpperCase(), path, cfg);
  }

  return router;
}
