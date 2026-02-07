import type { Diagnostic } from '../errors';
import { createDiagnostic } from '../errors';

export interface SchemaExecutionResult {
  jsonSchema: Record<string, unknown>;
}

export interface SchemaExecutor {
  execute(schemaName: string, sourceFile: string): Promise<SchemaExecutionResult | null>;

  getDiagnostics(): Diagnostic[];
}

export function createSchemaExecutor(_rootDir: string): SchemaExecutor {
  const diagnostics: Diagnostic[] = [];

  function addError(message: string, file: string): null {
    diagnostics.push(
      createDiagnostic({
        severity: 'error',
        code: 'VERTZ_SCHEMA_EXECUTION',
        message,
        file,
      }),
    );
    return null;
  }

  return {
    async execute(schemaName: string, sourceFile: string): Promise<SchemaExecutionResult | null> {
      try {
        const mod = await import(sourceFile);
        const schema = mod[schemaName];
        if (!schema) {
          return addError(`Export '${schemaName}' not found in '${sourceFile}'`, sourceFile);
        }
        if (typeof schema.toJSONSchema !== 'function') {
          return addError(
            `Export '${schemaName}' in '${sourceFile}' does not have a toJSONSchema() method`,
            sourceFile,
          );
        }
        return { jsonSchema: schema.toJSONSchema() };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return addError(
          `Failed to execute schema '${schemaName}' from '${sourceFile}': ${detail}`,
          sourceFile,
        );
      }
    },

    getDiagnostics(): Diagnostic[] {
      return [...diagnostics];
    },
  };
}
