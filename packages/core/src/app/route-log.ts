export interface RouteInfo {
  method: string;
  path: string;
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
