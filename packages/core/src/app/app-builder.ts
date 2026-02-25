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
  // Entity routes tracked separately for log output (they already include full paths)
  const entityRoutes: RouteInfo[] = [];

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
        const moduleRoutes = collectRoutes(config.basePath ?? '', registrations);
        const routes = [...moduleRoutes, ...entityRoutes];
        const url = `http://${serverHandle.hostname}:${serverHandle.port}`;
        console.log(formatRouteLog(url, routes));
      }

      return serverHandle;
    },
  };

  // Register entity route info for inspection (router.routes).
  // When _entityRoutes is provided (by @vertz/server), use those as the source of truth
  // since they only include routes with access rules defined.
  // Otherwise, fall back to registering all CRUD routes from entity config.
  if (config._entityRoutes) {
    for (const route of config._entityRoutes) {
      const info = { method: route.method, path: route.path };
      registeredRoutes.push(info);
      entityRoutes.push(info);
    }
  } else if (config.entities && config.entities.length > 0) {
    const rawPrefix = config.apiPrefix === undefined ? '/api/' : config.apiPrefix;
    for (const entity of config.entities) {
      const entityPath =
        rawPrefix === ''
          ? `/${entity.name}`
          : (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) + entity.name;
      const routes: RouteInfo[] = [
        { method: 'GET', path: entityPath },
        { method: 'GET', path: `${entityPath}/:id` },
        { method: 'POST', path: entityPath },
        { method: 'PATCH', path: `${entityPath}/:id` },
        { method: 'DELETE', path: `${entityPath}/:id` },
      ];

      if (entity.actions) {
        for (const actionName of Object.keys(entity.actions)) {
          routes.push({ method: 'POST', path: `${entityPath}/:id/${actionName}` });
        }
      }

      registeredRoutes.push(...routes);
      entityRoutes.push(...routes);
    }
  }

  return builder;
}
