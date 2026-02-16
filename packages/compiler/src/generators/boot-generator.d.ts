import type { AppIR } from '../ir/types';
import { BaseGenerator } from './base-generator';
export interface BootModuleEntry {
  name: string;
  importPath: string;
  variableName: string;
  options?: Record<string, unknown>;
}
export interface BootMiddlewareEntry {
  name: string;
  importPath: string;
  variableName: string;
}
export interface BootManifest {
  initializationOrder: string[];
  modules: BootModuleEntry[];
  globalMiddleware: BootMiddlewareEntry[];
}
export declare function buildBootManifest(ir: AppIR): BootManifest;
export declare function resolveImportPath(from: string, to: string): string;
export declare function renderBootFile(manifest: BootManifest, outputDir: string): string;
export declare class BootGenerator extends BaseGenerator {
  readonly name = 'boot';
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
//# sourceMappingURL=boot-generator.d.ts.map
