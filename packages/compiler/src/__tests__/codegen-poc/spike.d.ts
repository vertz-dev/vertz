import type { AppIR, HttpMethod, SchemaRef } from '../../ir/types';
type JsonSchema = Record<string, unknown>;
/**
 * Converts a JSON Schema object to a TypeScript type string.
 * Populates namedTypes map with extracted $defs when present.
 */
export declare function jsonSchemaToTS(
  schema: JsonSchema,
  namedTypes?: Map<string, string>,
  _resolving?: Set<string>,
): string;
export interface AdaptedOperation {
  operationId: string;
  method: HttpMethod;
  fullPath: string;
  schemaRefs: string[];
  body?: SchemaRef;
  query?: SchemaRef;
  params?: SchemaRef;
  headers?: SchemaRef;
  response?: SchemaRef;
}
export interface AdaptedModule {
  name: string;
  operations: AdaptedOperation[];
}
export interface SchemaCollision {
  name: string;
  modules: string[];
}
export interface AdaptedIR {
  modules: AdaptedModule[];
  sharedSchemas: string[];
  collisions: SchemaCollision[];
  allSchemaNames: string[];
}
export declare function adaptIR(appIR: AppIR): AdaptedIR;
/**
 * Generates a TypeScript types file for a single module.
 * Each schema becomes an exported type alias.
 */
export declare function emitTypesFile(
  _moduleName: string,
  schemas: Record<string, JsonSchema>,
): string;
/**
 * Generates a shared types file for schemas used by multiple modules.
 */
export declare function emitSharedTypesFile(schemas: Record<string, JsonSchema>): string;
interface OperationDef {
  operationId: string;
  method: string;
  fullPath: string;
}
/**
 * Generates a module file with a factory function.
 * The factory creates methods for each operation.
 */
export declare function emitModuleFile(
  moduleName: string,
  operations: OperationDef[],
  _typeImports: string[],
): string;
/**
 * Generates the client file that imports and composes all modules.
 */
export declare function emitClientFile(moduleNames: string[]): string;
//# sourceMappingURL=spike.d.ts.map
