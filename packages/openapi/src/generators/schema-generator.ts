import type { ParsedOperation, ParsedResource, ParsedSchema } from '../parser/types';
import {
  collectCircularRefs,
  isValidIdentifier,
  sanitizeTypeName,
  toPascalCase,
} from './json-schema-to-ts';
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

  // Component schemas → schemas/components.ts
  if (schemas.length > 0) {
    files.push({
      path: 'schemas/components.ts',
      content: generateComponentSchemas(schemas, namedSchemas),
    });
  }

  for (const resource of resources) {
    const content = generateResourceSchemas(resource, namedSchemas);
    files.push({ path: `schemas/${resource.identifier}.ts`, content });
  }

  // Barrel index
  const barrelLines: string[] = [];
  if (schemas.length > 0) {
    barrelLines.push("export * from './components';");
  }
  for (const r of resources) {
    barrelLines.push(`export * from './${r.identifier}';`);
  }
  files.push({ path: 'schemas/index.ts', content: barrelLines.join('\n') + '\n' });

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

function generateComponentSchemas(
  schemas: ParsedSchema[],
  namedSchemas: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push("import { z } from 'zod';");
  lines.push('');

  for (const s of schemas) {
    if (s.name) {
      const varName = toSchemaVarName(s.name);
      const zod = jsonSchemaToZod(s.jsonSchema, namedSchemas);
      lines.push(`export const ${varName} = ${zod};`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateResourceSchemas(
  resource: ParsedResource,
  namedSchemas: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push("import { z } from 'zod';");
  lines.push('');

  const emitted = new Set<string>();
  const componentImports = new Set<string>();

  for (const op of resource.operations) {
    // Collect component schema references for imports
    collectOperationComponentRefs(op, componentImports, namedSchemas);

    // Response schema
    if (op.response) {
      const varName = deriveResponseSchemaName(op);
      if (!emitted.has(varName)) {
        emitted.add(varName);
        // Skip if this is a component schema — it's in components.ts
        if (!isComponentSchemaVar(varName, namedSchemas)) {
          // For array responses, generate schema from items
          const schema = op.response.jsonSchema;
          const effectiveSchema =
            schema.type === 'array' && schema.items && typeof schema.items === 'object'
              ? (schema.items as Record<string, unknown>)
              : schema;
          const zod = jsonSchemaToZod(effectiveSchema, namedSchemas);
          lines.push(`export const ${varName} = ${zod};`);
          lines.push('');
        }
      }
    }

    // Input schema
    if (op.requestBody) {
      const varName = deriveInputSchemaName(op);
      if (!emitted.has(varName)) {
        emitted.add(varName);
        if (!isComponentSchemaVar(varName, namedSchemas)) {
          const zod = jsonSchemaToZod(op.requestBody.jsonSchema, namedSchemas);
          lines.push(`export const ${varName} = ${zod};`);
          lines.push('');
        }
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

  // Add component imports at the top (after zod import) if needed
  const actualImports = [...componentImports].sort();
  if (actualImports.length > 0) {
    lines.splice(2, 0, `import { ${actualImports.join(', ')} } from './components';`, '');
  }

  return lines.join('\n');
}

function collectOperationComponentRefs(
  op: ParsedOperation,
  imports: Set<string>,
  namedSchemas: Map<string, string>,
): void {
  const schemas: Record<string, unknown>[] = [];
  if (op.response) schemas.push(op.response.jsonSchema);
  if (op.requestBody) schemas.push(op.requestBody.jsonSchema);
  for (const param of op.queryParams) schemas.push(param.schema);

  for (const schema of schemas) {
    const refs = collectCircularRefs(schema);
    for (const ref of refs) {
      const varName = namedSchemas.get(ref);
      if (varName) imports.add(varName);
    }
  }
}

function isComponentSchemaVar(varName: string, namedSchemas: Map<string, string>): boolean {
  for (const componentVarName of namedSchemas.values()) {
    if (componentVarName === varName) return true;
  }
  return false;
}

function buildQueryZodSchema(op: ParsedOperation, namedSchemas: Map<string, string>): string {
  const entries = op.queryParams.map((param) => {
    let zod = jsonSchemaToZod(param.schema, namedSchemas);
    if (!param.required) zod += '.optional()';
    const safeKey = isValidIdentifier(param.name)
      ? param.name
      : `'${param.name.replace(/'/g, "\\'")}'`;
    return `  ${safeKey}: ${zod}`;
  });

  return `z.object({\n${entries.join(',\n')},\n})`;
}

function getTypePrefix(op: ParsedOperation): string {
  return op.typePrefix ?? toPascalCase(op.operationId);
}

function deriveResponseSchemaName(op: ParsedOperation): string {
  if (op.response?.name) return toSchemaVarName(op.response.name);
  return toSchemaVarName(getTypePrefix(op) + 'Response');
}

function deriveInputSchemaName(op: ParsedOperation): string {
  if (op.requestBody?.name) return toSchemaVarName(op.requestBody.name);
  return toSchemaVarName(getTypePrefix(op) + 'Input');
}

function deriveQuerySchemaName(op: ParsedOperation): string {
  return toSchemaVarName(getTypePrefix(op) + 'Query');
}

/**
 * Convert a schema name to a valid camelCase + "Schema" suffix variable name.
 * Sanitizes invalid identifier characters (hyphens, etc.) first.
 * e.g., "Task" → "taskSchema", "BrandModel-Output" → "brandModelOutputSchema"
 */
function toSchemaVarName(name: string): string {
  const sanitized = sanitizeTypeName(name);
  const camel = sanitized.charAt(0).toLowerCase() + sanitized.slice(1);
  return camel + 'Schema';
}
