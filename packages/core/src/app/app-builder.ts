import type { AccumulateProvides, NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedModule } from '../module/module';
import type { AppConfig } from '../types/app';
import type { ListenOptions, ServerHandle } from '../types/server-adapter';
import { buildHandler, type ModuleRegistration } from './app-runner';
import { detectAdapter } from './detect-adapter';
import { collectRoutes, formatRouteLog } from './route-log';

const DEFAULT_PORT = 3000;

export interface RouteInfo {
  method: string;
  path: string;
}

export interface AppBuilder<
  TMiddlewareCtx extends Record<string, unknown> = Record<string, unknown>,
> {
  register(module: NamedModule, options?: Record<string, unknown>): AppBuilder<TMiddlewareCtx>;
  // biome-ignore lint/suspicious/noExplicitAny: variance boundary — middleware TProvides must be accepted as-is
  middlewares<const M extends readonly NamedMiddlewareDef<any, any>[]>(
    list: M,
  ): AppBuilder<AccumulateProvides<M>>;
  readonly handler: (request: Request) => Promise<Response>;
  listen(port?: number, options?: ListenOptions): Promise<ServerHandle>;
  /** Exposes registered routes for testing/inspection */
  readonly router: { routes: RouteInfo[] };
}

export function createApp(config: AppConfig): AppBuilder {
  const registrations: ModuleRegistration[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  let globalMiddlewares: NamedMiddlewareDef<any, any>[] = [];
  let cachedHandler: ((request: Request) => Promise<Response>) | null = null;

  // Collect routes for router property
  const registeredRoutes: RouteInfo[] = [];

  const builder: AppBuilder = {
    register(module, options) {
      registrations.push({ module, options });
      // Collect routes from module routers
      for (const router of module.routers) {
        for (const route of router.routes) {
          registeredRoutes.push({ method: route.method, path: router.prefix + route.path });
        }
      }
      // Invalidate handler cache when new module is registered
      cachedHandler = null;
      return builder;
    },
    middlewares(list) {
      globalMiddlewares = [...list];
      return builder;
    },
    get handler() {
      if (!cachedHandler) {
        cachedHandler = buildHandler(config, registrations, globalMiddlewares);
      }
      return cachedHandler;
    },
    get router() {
      return { routes: registeredRoutes };
    },
    async listen(port, options) {
      const adapter = detectAdapter();
      const serverHandle = await adapter.listen(port ?? DEFAULT_PORT, builder.handler, options);

      if (options?.logRoutes !== false) {
        const routes = collectRoutes(config.basePath ?? '', registrations);
        const url = `http://${serverHandle.hostname}:${serverHandle.port}`;
        console.log(formatRouteLog(url, routes));
      }

      return serverHandle;
    },
  };

  // Process domains from config and register routes
  if (config.domains && config.domains.length > 0) {
    // Handle empty string vs undefined - empty string means no prefix, undefined means use default
    const rawPrefix = config.apiPrefix === undefined ? '/api/' : config.apiPrefix;
    for (const domain of config.domains) {
      // Build the domain path - ensure leading slash but don't double up
      const domainPath = rawPrefix === '' 
        ? '/' + domain.name 
        : (rawPrefix.endsWith('/') ? rawPrefix : rawPrefix + '/') + domain.name;
      // Register CRUD routes for the domain
      registeredRoutes.push({ method: 'GET', path: domainPath });       // list
      registeredRoutes.push({ method: 'GET', path: `${domainPath}/:id` }); // get
      registeredRoutes.push({ method: 'POST', path: domainPath });      // create
      registeredRoutes.push({ method: 'PUT', path: `${domainPath}/:id` }); // update
      registeredRoutes.push({ method: 'DELETE', path: `${domainPath}/:id` }); // delete

      // Register custom action routes
      if (domain.actions) {
        for (const actionName of Object.keys(domain.actions)) {
          registeredRoutes.push({ method: 'POST', path: `${domainPath}/:id/${actionName}` });
        }
      }
    }
  }

  return builder;
}
