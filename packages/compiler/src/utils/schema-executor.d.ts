import type { Diagnostic } from '../errors';
export interface SchemaExecutionResult {
  jsonSchema: Record<string, unknown>;
}
export interface SchemaExecutor {
  execute(schemaName: string, sourceFile: string): Promise<SchemaExecutionResult | null>;
  getDiagnostics(): Diagnostic[];
}
export declare function createSchemaExecutor(_rootDir: string): SchemaExecutor;
//# sourceMappingURL=schema-executor.d.ts.map
