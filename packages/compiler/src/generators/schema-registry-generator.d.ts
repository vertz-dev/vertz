import type { AppIR } from '../ir/types';
import { BaseGenerator } from './base-generator';
export interface SchemaRegistryEntry {
  name: string;
  id?: string;
  importPath: string;
  variableName: string;
  jsonSchema?: Record<string, unknown>;
}
export interface SchemaRegistryManifest {
  schemas: SchemaRegistryEntry[];
}
export declare function buildSchemaRegistry(ir: AppIR): SchemaRegistryManifest;
export declare function renderSchemaRegistryFile(
  manifest: SchemaRegistryManifest,
  outputDir: string,
): string;
export declare class SchemaRegistryGenerator extends BaseGenerator {
  readonly name = 'schema-registry';
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
//# sourceMappingURL=schema-registry-generator.d.ts.map
