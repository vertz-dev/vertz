import type { ModuleRegistration } from './app-runner';

export interface RouteInfo {
  method: string;
  path: string;
}

function normalizePath(path: string): string {
  // Remove trailing slash unless path is just "/"
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path || '/';
}

export function collectRoutes(basePath: string, registrations: ModuleRegistration[]): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const { module } of registrations) {
    for (const router of module.routers) {
      for (const route of router.routes) {
        routes.push({
          method: route.method,
          path: normalizePath(basePath + router.prefix + route.path),
        });
      }
    }
  }

  return routes;
}

export function formatRouteLog(listenUrl: string, routes: RouteInfo[]): string {
  const header = `vertz server listening on ${listenUrl}`;

  if (routes.length === 0) {
    return header;
  }

  const sorted = [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );

  const MIN_METHOD_WIDTH = 6; // "DELETE".length — keeps output stable
  const maxMethodLen = Math.max(MIN_METHOD_WIDTH, ...sorted.map((r) => r.method.length));

  const lines = sorted.map((r) => {
    const paddedMethod = r.method.padEnd(maxMethodLen);
    return `  ${paddedMethod} ${r.path}`;
  });

  return [header, '', ...lines].join('\n');
}
