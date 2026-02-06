import type { RouterDef } from '../types/module';

export interface RouteConfig {
  params?: any;
  body?: any;
  query?: any;
  response?: any;
  headers?: any;
  middlewares?: any[];
  handler: (ctx: any) => any;
}

export interface Route {
  method: string;
  path: string;
  config: RouteConfig;
}

export interface NamedRouterDef extends RouterDef {
  moduleName: string;
  routes: Route[];
  get: (path: string, config: RouteConfig) => NamedRouterDef;
  post: (path: string, config: RouteConfig) => NamedRouterDef;
  put: (path: string, config: RouteConfig) => NamedRouterDef;
  patch: (path: string, config: RouteConfig) => NamedRouterDef;
  delete: (path: string, config: RouteConfig) => NamedRouterDef;
  head: (path: string, config: RouteConfig) => NamedRouterDef;
}

export function createRouterDef(moduleName: string, config: RouterDef): NamedRouterDef {
  const routes: Route[] = [];

  function addRoute(method: string, path: string, routeConfig: RouteConfig): NamedRouterDef {
    routes.push({ method, path, config: routeConfig });
    return router;
  }

  const router: NamedRouterDef = {
    ...config,
    moduleName,
    routes,
    get: (path, cfg) => addRoute('GET', path, cfg),
    post: (path, cfg) => addRoute('POST', path, cfg),
    put: (path, cfg) => addRoute('PUT', path, cfg),
    patch: (path, cfg) => addRoute('PATCH', path, cfg),
    delete: (path, cfg) => addRoute('DELETE', path, cfg),
    head: (path, cfg) => addRoute('HEAD', path, cfg),
  };

  return router;
}
