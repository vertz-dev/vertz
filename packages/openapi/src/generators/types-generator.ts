import type { ParsedOperation, ParsedResource, ParsedSchema } from '../parser/types';
import {
  collectCircularRefs,
  generateInterface,
  getTypePrefix,
  isValidIdentifier,
  jsonSchemaToTS,
  sanitizeTypeName,
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

  // Component schemas → types/components.ts
  if (schemas.length > 0) {
    files.push({
      path: 'types/components.ts',
      content: generateComponentTypes(schemas, namedSchemas),
    });
  }

  for (const resource of resources) {
    const content = generateResourceTypes(resource, namedSchemas);
    files.push({ path: `types/${resource.identifier}.ts`, content: content || '' });
  }

  // Barrel index
  const barrelLines: string[] = [];
  if (schemas.length > 0) {
    barrelLines.push("export * from './components';");
  }
  for (const r of resources) {
    barrelLines.push(`export * from './${r.identifier}';`);
  }
  files.push({ path: 'types/index.ts', content: barrelLines.join('\n') + '\n' });

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

function generateComponentTypes(
  schemas: ParsedSchema[],
  namedSchemas: Map<string, string>,
): string {
  const interfaces: string[] = [];
  for (const s of schemas) {
    if (s.name) {
      interfaces.push(generateInterface(s.name, s.jsonSchema, namedSchemas));
    }
  }
  return interfaces.join('\n');
}

function generateResourceTypes(
  resource: ParsedResource,
  namedSchemas: Map<string, string>,
): string {
  const interfaces: string[] = [];
  const emitted = new Set<string>();
  const componentImports = new Set<string>();

  for (const op of resource.operations) {
    // Collect $circular refs from all operation schemas
    collectOperationCircularRefs(op, componentImports, namedSchemas);

    // Response interface
    if (op.response) {
      const name = deriveResponseName(op);
      if (!emitted.has(name)) {
        emitted.add(name);
        // Skip if this is a component schema — it's in components.ts
        if (namedSchemas.has(name)) {
          componentImports.add(name);
        } else {
          // For array responses, generate interface from items schema
          const schema = op.response.jsonSchema;
          const effectiveSchema =
            schema.type === 'array' && schema.items && typeof schema.items === 'object'
              ? (schema.items as Record<string, unknown>)
              : schema;
          interfaces.push(generateInterface(name, effectiveSchema, namedSchemas));
        }
      }
    }

    // Input interface (request body)
    if (op.requestBody) {
      const name = deriveInputName(op);
      if (!emitted.has(name)) {
        emitted.add(name);
        if (namedSchemas.has(name)) {
          componentImports.add(name);
        } else {
          interfaces.push(generateInterface(name, op.requestBody.jsonSchema, namedSchemas));
        }
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

  const lines: string[] = [];

  // Add import for component types referenced via $circular or as named schemas
  const actualImports = [...componentImports].filter((name) => namedSchemas.has(name)).sort();
  if (actualImports.length > 0) {
    lines.push(`import type { ${actualImports.join(', ')} } from './components';`);
    lines.push('');
  }

  lines.push(interfaces.join('\n'));
  return lines.join('\n');
}

function collectOperationCircularRefs(
  op: ParsedOperation,
  imports: Set<string>,
  namedSchemas: Map<string, string>,
): void {
  if (op.response) {
    const refs = collectCircularRefs(op.response.jsonSchema);
    for (const ref of refs) {
      if (namedSchemas.has(ref)) imports.add(ref);
    }
  }
  if (op.requestBody) {
    const refs = collectCircularRefs(op.requestBody.jsonSchema);
    for (const ref of refs) {
      if (namedSchemas.has(ref)) imports.add(ref);
    }
  }
  for (const param of op.queryParams) {
    const refs = collectCircularRefs(param.schema);
    for (const ref of refs) {
      if (namedSchemas.has(ref)) imports.add(ref);
    }
  }
}

function deriveResponseName(op: ParsedOperation): string {
  if (op.response?.name) return sanitizeTypeName(op.response.name);
  return getTypePrefix(op) + 'Response';
}

function deriveInputName(op: ParsedOperation): string {
  if (op.requestBody?.name) return sanitizeTypeName(op.requestBody.name);
  return getTypePrefix(op) + 'Input';
}

function deriveQueryName(op: ParsedOperation): string {
  return getTypePrefix(op) + 'Query';
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

  // Index signature makes query interfaces assignable to Record<string, unknown>
  // which FetchClient.get() expects for the query option (#2217)
  lines.push('  [key: string]: unknown;');

  return `export interface ${sanitizeTypeName(name)} {\n${lines.join('\n')}\n}\n`;
}
