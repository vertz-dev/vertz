import type { AppIR, DependencyEdgeKind, HttpMethod } from '../ir/types';
import { BaseGenerator } from './base-generator';
export interface ManifestModule {
  name: string;
  services: string[];
  routers: string[];
  exports: string[];
  imports: {
    from: string;
    items: string[];
  }[];
}
export interface ManifestRoute {
  method: HttpMethod;
  path: string;
  operationId: string;
  module: string;
  router: string;
  middleware: string[];
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  response?: Record<string, unknown>;
}
export interface ManifestMiddleware {
  name: string;
  provides?: Record<string, unknown>;
  requires?: Record<string, unknown>;
}
export interface ManifestDependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeKind;
}
export interface ManifestDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}
export interface AppManifest {
  version: string;
  app: {
    basePath: string;
    version?: string;
  };
  modules: ManifestModule[];
  routes: ManifestRoute[];
  schemas: Record<string, Record<string, unknown>>;
  middleware: ManifestMiddleware[];
  dependencyGraph: {
    initializationOrder: string[];
    edges: ManifestDependencyEdge[];
  };
  diagnostics: {
    errors: number;
    warnings: number;
    items: ManifestDiagnostic[];
  };
}
export declare function buildManifest(ir: AppIR): AppManifest;
export declare class ManifestGenerator extends BaseGenerator {
  readonly name = 'manifest';
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
//# sourceMappingURL=manifest-generator.d.ts.map
