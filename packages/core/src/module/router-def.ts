import type { HandlerCtx } from '../types/context';
import type { RouterDef } from '../types/module';

type InferOutput<T> = T extends { _output: infer O }
  ? O
  : T extends { parse(v: unknown): infer P }
    ? P
    : unknown;

type TypedHandlerCtx<
  TParams = unknown,
  TQuery = unknown,
  THeaders = unknown,
  TBody = unknown,
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
> = Omit<HandlerCtx, 'params' | 'query' | 'headers' | 'body'> & {
  params: TParams;
  query: TQuery;
  headers: THeaders;
  body: TBody;
} & TMiddleware;

export interface RouteConfig<
  TParams = unknown,
  TQuery = unknown,
  THeaders = unknown,
  TBody = unknown,
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
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
      InferOutput<TBody>,
      TMiddleware
    >,
  ) => unknown;
}

export interface Route {
  method: string;
  path: string;
  config: RouteConfig<unknown, unknown, unknown, unknown, Record<string, unknown>>;
}

type HttpMethodFn<TMiddleware extends Record<string, unknown> = Record<string, unknown>> = <
  TParams,
  TQuery,
  THeaders,
  TBody,
>(
  path: `/${string}`,
  config: RouteConfig<TParams, TQuery, THeaders, TBody, TMiddleware>,
) => NamedRouterDef<TMiddleware>;

export interface NamedRouterDef<
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
> extends RouterDef {
  moduleName: string;
  routes: Route[];
  get: HttpMethodFn<TMiddleware>;
  post: HttpMethodFn<TMiddleware>;
  put: HttpMethodFn<TMiddleware>;
  patch: HttpMethodFn<TMiddleware>;
  delete: HttpMethodFn<TMiddleware>;
  head: HttpMethodFn<TMiddleware>;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;

export function createRouterDef<
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
>(moduleName: string, config: RouterDef): NamedRouterDef<TMiddleware> {
  const routes: Route[] = [];

  function addRoute(
    method: string,
    path: string,
    // biome-ignore lint/suspicious/noExplicitAny: route config is type-safe at the HttpMethodFn call site
    routeConfig: RouteConfig<any, any, any, any, any>,
  ): NamedRouterDef<TMiddleware> {
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
  } as NamedRouterDef<TMiddleware>;

  for (const method of HTTP_METHODS) {
    router[method] = (path, cfg) => addRoute(method.toUpperCase(), path, cfg);
  }

  return router;
}
