import type { ModuleRegistration } from './app-runner';
export interface RouteInfo {
  method: string;
  path: string;
}
export declare function collectRoutes(
  basePath: string,
  registrations: ModuleRegistration[],
): RouteInfo[];
export declare function formatRouteLog(listenUrl: string, routes: RouteInfo[]): string;
//# sourceMappingURL=route-log.d.ts.map
