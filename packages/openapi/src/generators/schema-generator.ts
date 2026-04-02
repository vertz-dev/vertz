import type { ParsedOperation, ParsedResource, ParsedSchema } from '../parser/types';
import { jsonSchemaToZod } from './json-schema-to-zod';
import type { GeneratedFile } from './types';

/**
 * Generate Zod schema files for all resources + barrel index.
 */
export function generateSchemas(
  resources: ParsedResource[],
  schemas: ParsedSchema[],
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const namedSchemas = buildNamedSchemaMap(schemas);

  for (const resource of resources) {
    const content = generateResourceSchemas(resource, namedSchemas);
    files.push({ path: `schemas/${resource.identifier}.ts`, content });
  }

  // Barrel index
  const exports = resources
    .map((r) => `export * from './${r.identifier}';`)
    .join('\n');
  files.push({ path: 'schemas/index.ts', content: exports + '\n' });

  return files;
}

function buildNamedSchemaMap(schemas: ParsedSchema[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of schemas) {
    if (s.name) {
      map.set(s.name, toSchemaVarName(s.name));
    }
  }
  return map;
}

function generateResourceSchemas(
  resource: ParsedResource,
  namedSchemas: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push("import { z } from 'zod';");
  lines.push('');

  const emitted = new Set<string>();

  for (const op of resource.operations) {
    // Response schema
    if (op.response) {
      const varName = deriveResponseSchemaName(op);
      if (!emitted.has(varName)) {
        emitted.add(varName);
        const zod = jsonSchemaToZod(op.response.jsonSchema, namedSchemas);
        lines.push(`export const ${varName} = ${zod};`);
        lines.push('');
      }
    }

    // Input schema
    if (op.requestBody) {
      const varName = deriveInputSchemaName(op);
      if (!emitted.has(varName)) {
        emitted.add(varName);
        const zod = jsonSchemaToZod(op.requestBody.jsonSchema, namedSchemas);
        lines.push(`export const ${varName} = ${zod};`);
        lines.push('');
      }
    }

    // Query schema
    if (op.queryParams.length > 0) {
      const varName = deriveQuerySchemaName(op);
      if (!emitted.has(varName)) {
        emitted.add(varName);
        lines.push(`export const ${varName} = ${buildQueryZodSchema(op, namedSchemas)};`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function buildQueryZodSchema(
  op: ParsedOperation,
  namedSchemas: Map<string, string>,
): string {
  const entries = op.queryParams.map((param) => {
    let zod = jsonSchemaToZod(param.schema, namedSchemas);
    if (!param.required) zod += '.optional()';
    return `  ${param.name}: ${zod}`;
  });

  return `z.object({\n${entries.join(',\n')},\n})`;
}

function deriveResponseSchemaName(op: ParsedOperation): string {
  if (op.response?.name) return toSchemaVarName(op.response.name);
  return toSchemaVarName(op.operationId + 'Response');
}

function deriveInputSchemaName(op: ParsedOperation): string {
  if (op.requestBody?.name) return toSchemaVarName(op.requestBody.name);
  return toSchemaVarName(op.operationId + 'Input');
}

function deriveQuerySchemaName(op: ParsedOperation): string {
  return toSchemaVarName(op.operationId + 'Query');
}

/**
 * Convert PascalCase name to camelCase + "Schema" suffix.
 * e.g., "Task" → "taskSchema", "CreateTaskInput" → "createTaskInputSchema"
 */
function toSchemaVarName(name: string): string {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  return camel + 'Schema';
}
