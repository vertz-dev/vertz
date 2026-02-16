import { createDiagnostic } from '../errors';
export function createSchemaExecutor(_rootDir) {
  const diagnostics = [];
  function addError(message, file) {
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
    async execute(schemaName, sourceFile) {
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
    getDiagnostics() {
      return [...diagnostics];
    },
  };
}
//# sourceMappingURL=schema-executor.js.map
