import type { ParsedOperation, ParsedResource, ParsedSchema } from '../parser/types';
import {
  generateInterface,
  isValidIdentifier,
  jsonSchemaToTS,
  sanitizeTypeName,
  toPascalCase,
} from './json-schema-to-ts';
import type { GeneratedFile } from './types';

/**
 * Generate types files for all resources + a barrel index.
 */
export function generateTypes(
  resources: ParsedResource[],
  schemas: ParsedSchema[],
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const namedSchemas = buildNamedSchemaMap(schemas);

  for (const resource of resources) {
    const content = generateResourceTypes(resource, namedSchemas);
    files.push({ path: `types/${resource.identifier}.ts`, content: content || '' });
  }

  // Barrel index
  const exports = resources.map((r) => `export * from './${r.identifier}';`).join('\n');
  files.push({ path: 'types/index.ts', content: exports + '\n' });

  return files;
}

function buildNamedSchemaMap(schemas: ParsedSchema[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of schemas) {
    if (s.name) {
      map.set(s.name, s.name);
    }
  }
  return map;
}

function generateResourceTypes(
  resource: ParsedResource,
  namedSchemas: Map<string, string>,
): string {
  const interfaces: string[] = [];
  const emitted = new Set<string>();

  for (const op of resource.operations) {
    // Response interface
    if (op.response) {
      const name = deriveResponseName(op);
      if (!emitted.has(name)) {
        emitted.add(name);
        // For array responses, generate interface from items schema
        const schema = op.response.jsonSchema;
        const effectiveSchema =
          schema.type === 'array' && schema.items && typeof schema.items === 'object'
            ? (schema.items as Record<string, unknown>)
            : schema;
        interfaces.push(generateInterface(name, effectiveSchema, namedSchemas));
      }
    }

    // Input interface (request body)
    if (op.requestBody) {
      const name = deriveInputName(op);
      if (!emitted.has(name)) {
        emitted.add(name);
        interfaces.push(generateInterface(name, op.requestBody.jsonSchema, namedSchemas));
      }
    }

    // Query interface
    if (op.queryParams.length > 0) {
      const name = deriveQueryName(op);
      if (!emitted.has(name)) {
        emitted.add(name);
        interfaces.push(generateQueryInterface(name, op, namedSchemas));
      }
    }
  }

  return interfaces.join('\n');
}

function deriveResponseName(op: ParsedOperation): string {
  if (op.response?.name) return sanitizeTypeName(op.response.name);
  return toPascalCase(op.operationId) + 'Response';
}

function deriveInputName(op: ParsedOperation): string {
  if (op.requestBody?.name) return sanitizeTypeName(op.requestBody.name);
  return toPascalCase(op.operationId) + 'Input';
}

function deriveQueryName(op: ParsedOperation): string {
  return toPascalCase(op.operationId) + 'Query';
}

function generateQueryInterface(
  name: string,
  op: ParsedOperation,
  namedSchemas: Map<string, string>,
): string {
  const lines = op.queryParams.map((param) => {
    const tsType = jsonSchemaToTS(param.schema, namedSchemas);
    const optional = param.required ? '' : '?';
    const safeKey = isValidIdentifier(param.name)
      ? param.name
      : `'${param.name.replace(/'/g, "\\'")}'`;
    return `  ${safeKey}${optional}: ${tsType};`;
  });

  return `export interface ${sanitizeTypeName(name)} {\n${lines.join('\n')}\n}\n`;
}

