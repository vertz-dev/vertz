import type { ParsedOperation, ParsedResource } from '../parser/types';
import { sanitizeTypeName, toPascalCase } from './json-schema-to-ts';
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
  lines.push("import type { FetchClient, FetchResponse } from '@vertz/fetch';");
  if (typeImports.size > 0) {
    const sorted = [...typeImports].sort();
    lines.push(`import type { ${sorted.join(', ')} } from '../types/${resource.identifier}';`);
  }
  lines.push('');

  // Factory function
  lines.push(`export function create${resource.name}Resource(client: FetchClient) {`);
  lines.push('  return {');

  // Detect duplicate method names — error instead of silently losing methods
  validateUniqueMethodNames(resource);

  for (const op of resource.operations) {
    if (op.streamingFormat && op.jsonResponse) {
      // Dual content type: generate standard JSON method first
      const jsonOp: ParsedOperation = {
        ...op,
        streamingFormat: undefined,
        jsonResponse: undefined,
        response: op.jsonResponse,
      };
      lines.push(`    ${generateMethod(jsonOp)},`);
      // Then generate streaming method with Stream suffix
      const streamOp: ParsedOperation = {
        ...op,
        methodName: op.methodName + 'Stream',
        jsonResponse: undefined,
      };
      lines.push(`    ${generateMethod(streamOp)},`);
    } else {
      lines.push(`    ${generateMethod(op)},`);
    }
  }

  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateMethod(op: ParsedOperation): string {
  const params = buildParams(op);
  const returnType = buildReturnType(op);

  if (op.streamingFormat) {
    const call = buildStreamingCall(op);
    return `/** @throws {FetchError} on non-2xx response */\n    ${op.methodName}: (${params}): ${returnType} =>\n      ${call}`;
  }

  const call = buildCall(op);
  return `${op.methodName}: (${params}): ${returnType} =>\n      ${call}`;
}

function validateUniqueMethodNames(resource: ParsedResource): void {
  const seen = new Map<string, string[]>();
  for (const op of resource.operations) {
    const existing = seen.get(op.methodName);
    if (existing) {
      existing.push(op.operationId);
    } else {
      seen.set(op.methodName, [op.operationId]);
    }
  }

  const duplicates = [...seen.entries()].filter(([, ids]) => ids.length > 1);
  if (duplicates.length > 0) {
    const details = duplicates
      .map(([name, ids]) => `  - "${name}" used by: ${ids.join(', ')}`)
      .join('\n');

    throw new Error(
      `Duplicate method name${duplicates.length > 1 ? 's' : ''} ${duplicates.map(([n]) => `"${n}"`).join(', ')} in resource "${resource.name}". ` +
        `Each operation within a resource must have a unique method name.\n${details}\n\n` +
        `Fix: use excludeTags to skip this tag, use a different groupBy strategy, ` +
        `or provide operationIds.overrides to rename conflicting operations.`,
    );
  }

  // Check that dual-content Stream suffix doesn't collide with existing method names
  for (const op of resource.operations) {
    if (op.streamingFormat && op.jsonResponse) {
      const streamName = op.methodName + 'Stream';
      if (seen.has(streamName)) {
        throw new Error(
          `Method name collision: dual-content operation "${op.operationId}" generates ` +
            `"${streamName}" which conflicts with existing method "${streamName}" in resource "${resource.name}".`,
        );
      }
    }
  }
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

  // Signal param for streaming operations
  if (op.streamingFormat) {
    parts.push('options?: { signal?: AbortSignal }');
  }

  return parts.join(', ');
}

function buildReturnType(op: ParsedOperation): string {
  if (op.streamingFormat) {
    const typeName = deriveStreamingTypeName(op);
    return `AsyncGenerator<${typeName}>`;
  }

  if (op.responseStatus === 204) return 'Promise<FetchResponse<void>>';

  if (op.response?.name) {
    const safeName = sanitizeTypeName(op.response.name);
    // Check if this is an array response
    if (op.response.jsonSchema.type === 'array') {
      return `Promise<FetchResponse<${safeName}[]>>`;
    }
    return `Promise<FetchResponse<${safeName}>>`;
  }

  // For list operations returning arrays, check the response schema
  if (op.response?.jsonSchema.type === 'array') {
    return 'Promise<FetchResponse<unknown[]>>';
  }

  if (op.response) {
    const name = toPascalCase(op.operationId) + 'Response';
    return `Promise<FetchResponse<${name}>>`;
  }

  return 'Promise<FetchResponse<void>>';
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

function buildStreamingCall(op: ParsedOperation): string {
  const typeName = deriveStreamingTypeName(op);
  const path = buildPath(op);
  const props: string[] = [
    `method: '${op.method}'`,
    `path: ${path}`,
    `format: '${op.streamingFormat}'`,
  ];
  if (op.requestBody) props.push('body');
  if (op.queryParams.length > 0) props.push('query');
  props.push('signal: options?.signal');
  return `client.requestStream<${typeName}>({ ${props.join(', ')} })`;
}

function deriveStreamingTypeName(op: ParsedOperation): string {
  if (op.response?.name) return sanitizeTypeName(op.response.name);
  if (op.response) return toPascalCase(op.operationId) + 'Event';
  return 'unknown';
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
    // Response type (streaming or standard)
    if (op.responseStatus !== 204 && op.response) {
      if (op.streamingFormat) {
        const streamTypeName = deriveStreamingTypeName(op);
        if (streamTypeName !== 'unknown') types.add(streamTypeName);
      } else if (op.response.name) {
        types.add(sanitizeTypeName(op.response.name));
      } else {
        types.add(toPascalCase(op.operationId) + 'Response');
      }
    }

    // JSON response type for dual content
    if (op.jsonResponse) {
      if (op.jsonResponse.name) {
        types.add(sanitizeTypeName(op.jsonResponse.name));
      } else {
        types.add(toPascalCase(op.operationId) + 'Response');
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
  if (op.requestBody?.name) return sanitizeTypeName(op.requestBody.name);
  return toPascalCase(op.operationId) + 'Input';
}

function deriveQueryName(op: ParsedOperation): string {
  return toPascalCase(op.operationId) + 'Query';
}
