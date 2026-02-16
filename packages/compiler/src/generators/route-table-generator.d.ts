import type { AppIR, HttpMethod } from '../ir/types';
import { BaseGenerator } from './base-generator';
export interface RouteTableSchemas {
  params?: string;
  query?: string;
  body?: string;
  headers?: string;
  response?: string;
}
export interface RouteTableEntry {
  method: HttpMethod;
  path: string;
  operationId: string;
  moduleName: string;
  routerName: string;
  middleware: string[];
  schemas: RouteTableSchemas;
}
export interface RouteTableManifest {
  routes: RouteTableEntry[];
}
export declare function buildRouteTable(ir: AppIR): RouteTableManifest;
export declare function renderRouteTableFile(manifest: RouteTableManifest): string;
export declare class RouteTableGenerator extends BaseGenerator {
  readonly name = 'route-table';
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
//# sourceMappingURL=route-table-generator.d.ts.map
