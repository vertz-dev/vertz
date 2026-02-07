import type { Diagnostic } from '../errors';
import { createDiagnostic } from '../errors';

export interface SchemaExecutionResult {
  jsonSchema: Record<string, unknown>;
}

export interface SchemaExecutor {
  execute(
    schemaName: string,
    sourceFile: string,
  ): Promise<SchemaExecutionResult | null>;

  getDiagnostics(): Diagnostic[];
}

export function createSchemaExecutor(_rootDir: string): SchemaExecutor {
  const diagnostics: Diagnostic[] = [];

  return {
    async execute(schemaName: string, sourceFile: string): Promise<SchemaExecutionResult | null> {
      try {
        const mod = await import(sourceFile);
        const schema = mod[schemaName];
        if (!schema) {
          diagnostics.push(createDiagnostic({
            severity: 'error',
            code: 'VERTZ_SCHEMA_EXECUTION',
            message: `Export '${schemaName}' not found in '${sourceFile}'`,
            file: sourceFile,
          }));
          return null;
        }
        if (typeof schema.toJSONSchema !== 'function') {
          diagnostics.push(createDiagnostic({
            severity: 'error',
            code: 'VERTZ_SCHEMA_EXECUTION',
            message: `Export '${schemaName}' in '${sourceFile}' does not have a toJSONSchema() method`,
            file: sourceFile,
          }));
          return null;
        }
        const jsonSchema = schema.toJSONSchema();
        return { jsonSchema };
      } catch (err) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'VERTZ_SCHEMA_EXECUTION',
          message: `Failed to execute schema '${schemaName}' from '${sourceFile}': ${err instanceof Error ? err.message : String(err)}`,
          file: sourceFile,
        }));
        return null;
      }
    },

    getDiagnostics(): Diagnostic[] {
      return [...diagnostics];
    },
  };
}
