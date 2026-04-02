import type { ParsedOperation, ParsedResource } from '../parser/types';
import type { GeneratedFile } from './types';

/**
 * Generate resource SDK files for all resources + a barrel index.
 */
export function generateResources(resources: ParsedResource[]): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const resource of resources) {
    files.push({
      path: `resources/${resource.identifier}.ts`,
      content: generateResourceFile(resource),
    });
  }

  // Barrel index
  const exports = resources
    .map((r) => `export { create${r.name}Resource } from './${r.identifier}';`)
    .join('\n');
  files.push({ path: 'resources/index.ts', content: exports + '\n' });

  return files;
}

function generateResourceFile(resource: ParsedResource): string {
  const lines: string[] = [];
  const typeImports = collectTypeImports(resource);

  // Imports
  lines.push("import type { HttpClient } from '../client';");
  if (typeImports.size > 0) {
    const sorted = [...typeImports].sort();
    lines.push(
      `import type { ${sorted.join(', ')} } from '../types/${resource.identifier}';`,
    );
  }
  lines.push('');

  // Factory function
  lines.push(`export function create${resource.name}Resource(client: HttpClient) {`);
  lines.push('  return {');

  for (const op of resource.operations) {
    lines.push(`    ${generateMethod(op)},`);
  }

  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateMethod(op: ParsedOperation): string {
  const params = buildParams(op);
  const returnType = buildReturnType(op);
  const call = buildCall(op);

  return `${op.methodName}: (${params}): ${returnType} =>\n      ${call}`;
}

function buildParams(op: ParsedOperation): string {
  const parts: string[] = [];

  // Path params first
  for (const p of op.pathParams) {
    parts.push(`${p.name}: string`);
  }

  // Body param for POST/PUT/PATCH
  if (op.requestBody) {
    const inputName = deriveInputName(op);
    parts.push(`body: ${inputName}`);
  }

  // Query param (optional) for operations with query params
  if (op.queryParams.length > 0) {
    const queryName = deriveQueryName(op);
    parts.push(`query?: ${queryName}`);
  }

  return parts.join(', ');
}

function buildReturnType(op: ParsedOperation): string {
  if (op.responseStatus === 204) return 'Promise<void>';

  if (op.response?.name) {
    // Check if this is an array response
    if (op.response.jsonSchema.type === 'array') {
      const itemName = op.response.name;
      return `Promise<${itemName}[]>`;
    }
    return `Promise<${op.response.name}>`;
  }

  // For list operations returning arrays, check the response schema
  if (op.response?.jsonSchema.type === 'array') {
    return 'Promise<unknown[]>';
  }

  if (op.response) {
    const name = capitalize(op.operationId) + 'Response';
    return `Promise<${name}>`;
  }

  return 'Promise<void>';
}

function buildCall(op: ParsedOperation): string {
  const method = op.method.toLowerCase();
  const path = buildPath(op);
  const args: string[] = [path];

  // Body for POST/PUT/PATCH
  if (op.requestBody) {
    args.push('body');
  }

  // Query for GET with query params
  if (op.queryParams.length > 0) {
    args.push('{ query }');
  }

  return `client.${method}(${args.join(', ')})`;
}

function buildPath(op: ParsedOperation): string {
  if (op.pathParams.length === 0) {
    return `'${op.path}'`;
  }

  // Replace {param} with ${encodeURIComponent(param)}
  let path = op.path;
  for (const p of op.pathParams) {
    path = path.replace(`{${p.name}}`, `\${encodeURIComponent(${p.name})}`);
  }
  return `\`${path}\``;
}

function collectTypeImports(resource: ParsedResource): Set<string> {
  const types = new Set<string>();

  for (const op of resource.operations) {
    // Response type
    if (op.responseStatus !== 204 && op.response) {
      if (op.response.name) {
        types.add(op.response.name);
      } else {
        types.add(capitalize(op.operationId) + 'Response');
      }
    }

    // Input type
    if (op.requestBody) {
      types.add(deriveInputName(op));
    }

    // Query type
    if (op.queryParams.length > 0) {
      types.add(deriveQueryName(op));
    }
  }

  return types;
}

function deriveInputName(op: ParsedOperation): string {
  if (op.requestBody?.name) return op.requestBody.name;
  return capitalize(op.operationId) + 'Input';
}

function deriveQueryName(op: ParsedOperation): string {
  return capitalize(op.operationId) + 'Query';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
