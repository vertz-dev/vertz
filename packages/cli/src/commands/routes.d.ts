import type { Compiler, HttpMethod } from '@vertz/compiler';
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
export interface RoutesResult {
  routes: FlatRoute[];
  output: string;
}
export declare function routesAction(options: RoutesOptions): Promise<RoutesResult>;
//# sourceMappingURL=routes.d.ts.map
