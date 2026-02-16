import { buildHandler } from './app-runner';
import { detectAdapter } from './detect-adapter';
import { collectRoutes, formatRouteLog } from './route-log';

const DEFAULT_PORT = 3000;
export function createApp(config) {
  const registrations = [];
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  let globalMiddlewares = [];
  let cachedHandler = null;
  // Collect routes for router property
  const registeredRoutes = [];
  const builder = {
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
      const domainPath =
        rawPrefix === ''
          ? `/${domain.name}`
          : (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) + domain.name;
      // Register CRUD routes for the domain
      registeredRoutes.push({ method: 'GET', path: domainPath }); // list
      registeredRoutes.push({ method: 'GET', path: `${domainPath}/:id` }); // get
      registeredRoutes.push({ method: 'POST', path: domainPath }); // create
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
//# sourceMappingURL=app-builder.js.map
