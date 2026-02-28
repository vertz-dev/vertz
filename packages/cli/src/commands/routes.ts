import type { Compiler, HttpMethod, MiddlewareRef } from '@vertz/compiler';
import { ok, type Result } from '@vertz/errors';

export interface FlatRoute {
  method: HttpMethod;
  path: string;
  fullPath: string;
  operationId: string;
  moduleName: string;
  middleware: string[];
}

export interface RoutesOptions {
  compiler: Compiler;
  format: 'table' | 'json';
  module?: string;
}

function extractRoutes(ir: {
  modules: Array<{
    name: string;
    routers: Array<{
      routes: Array<{
        method: HttpMethod;
        path: string;
        fullPath: string;
        operationId: string;
        middleware: MiddlewareRef[];
      }>;
    }>;
  }>;
}): FlatRoute[] {
  const routes: FlatRoute[] = [];
  for (const mod of ir.modules) {
    for (const router of mod.routers) {
      for (const route of router.routes) {
        routes.push({
          method: route.method,
          path: route.path,
          fullPath: route.fullPath,
          operationId: route.operationId,
          moduleName: mod.name,
          middleware: route.middleware.map((m) => m.name),
        });
      }
    }
  }
  return routes;
}

function formatTable(routes: FlatRoute[]): string {
  if (routes.length === 0) {
    return 'No routes found.';
  }

  const headers = ['Method', 'Path', 'Operation ID', 'Module', 'Middleware'];
  const rows = routes.map((r) => [
    r.method,
    r.path,
    r.operationId,
    r.moduleName,
    r.middleware.join(', ') || '-',
  ]);

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));

  const lines: string[] = [];
  lines.push(`Routes (${routes.length} total)\n`);
  lines.push(headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join('  '));
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    lines.push(row.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  '));
  }

  return lines.join('\n');
}

export async function routesAction(
  options: RoutesOptions,
): Promise<Result<{ routes: FlatRoute[]; output: string }, Error>> {
  const { compiler, format, module: moduleFilter } = options;

  const ir = await compiler.analyze();
  let routes = extractRoutes(ir);

  if (moduleFilter) {
    routes = routes.filter((r) => r.moduleName === moduleFilter);
  }

  let output: string;
  if (format === 'json') {
    output = JSON.stringify(routes);
  } else {
    output = formatTable(routes);
  }

  return ok({ routes, output });
}
