import type { HandlerCtx } from '../types/context';
import type { RouterDef } from '../types/module';

export interface RouteConfig {
  params?: unknown;
  body?: unknown;
  query?: unknown;
  response?: unknown;
  headers?: unknown;
  middlewares?: unknown[];
  handler: (ctx: HandlerCtx) => unknown;
}

export interface Route {
  method: string;
  path: string;
  config: RouteConfig;
}

type HttpMethodFn = (path: string, config: RouteConfig) => NamedRouterDef;

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
