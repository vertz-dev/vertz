const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'];
export function createRouterDef(moduleName, config) {
  const routes = [];
  function addRoute(
    method,
    path,
    // biome-ignore lint/suspicious/noExplicitAny: route config is type-safe at the HttpMethodFn call site
    routeConfig,
  ) {
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
  };
  for (const method of HTTP_METHODS) {
    router[method] = (path, cfg) => addRoute(method.toUpperCase(), path, cfg);
  }
  return router;
}
//# sourceMappingURL=router-def.js.map
