import type { AccumulateProvides, NamedMiddlewareDef } from '../middleware/middleware-def';
import type { AppConfig } from '../types/app';
import type { ListenOptions, ServerHandle } from '../types/server-adapter';
import { buildHandler } from './app-runner';
import { detectAdapter } from './detect-adapter';
import { formatRouteLog } from './route-log';

const DEFAULT_PORT = 3000;

export interface RouteInfo {
  method: string;
  path: string;
}

export interface AppBuilder<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TMiddlewareCtx carries the accumulated middleware type through .middlewares() chaining
  _TMiddlewareCtx extends Record<string, unknown> = Record<string, unknown>,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance boundary — middleware TProvides must be accepted as-is
  middlewares<const M extends readonly NamedMiddlewareDef<any, any>[]>(
    list: M,
  ): AppBuilder<AccumulateProvides<M>>;
  readonly handler: (request: Request) => Promise<Response>;
  listen(port?: number, options?: ListenOptions): Promise<ServerHandle>;
  /** Exposes registered routes for testing/inspection */
  readonly router: { routes: RouteInfo[] };
}

export function createApp(config: AppConfig): AppBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime layer accepts any middleware generics
  let globalMiddlewares: NamedMiddlewareDef<any, any>[] = [];
  let cachedHandler: ((request: Request) => Promise<Response>) | null = null;

  // Collect routes for router property
  const registeredRoutes: RouteInfo[] = [];
  // Entity routes tracked separately for log output (they already include full paths)
  const entityRoutes: RouteInfo[] = [];

  const builder: AppBuilder = {
    middlewares(list) {
      globalMiddlewares = [...list];
      return builder;
    },
    get handler() {
      if (!cachedHandler) {
        cachedHandler = buildHandler(config, globalMiddlewares);
      }
      return cachedHandler;
    },
    get router() {
      return { routes: registeredRoutes };
    },
    async listen(port, options) {
      const adapter = await detectAdapter();
      const serverHandle = await adapter.listen(port ?? DEFAULT_PORT, builder.handler, options);

      if (options?.logRoutes !== false) {
        const displayHost =
          serverHandle.hostname === '0.0.0.0' || serverHandle.hostname === '::'
            ? 'localhost'
            : serverHandle.hostname;
        const url = `http://${displayHost}:${serverHandle.port}`;
        console.log(formatRouteLog(url, entityRoutes));
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
