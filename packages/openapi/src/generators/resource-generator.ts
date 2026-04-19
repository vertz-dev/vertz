import type { ParsedOperation, ParsedResource, ParsedSchema } from '../parser/types';
import { collectCircularRefs, getTypePrefix, sanitizeTypeName } from './json-schema-to-ts';
import type { GeneratedFile } from './types';

/**
 * Generate resource SDK files for all resources + a barrel index.
 */
export function generateResources(
  resources: ParsedResource[],
  schemas: ParsedSchema[] = [],
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const componentNames = new Set(schemas.filter((s) => s.name).map((s) => s.name!));

  for (const resource of resources) {
    files.push({
      path: `resources/${resource.identifier}.ts`,
      content: generateResourceFile(resource, componentNames),
    });
  }

  // Barrel index
  const exports = resources
    .map((r) => `export { create${r.name}Resource } from './${r.identifier}';`)
    .join('\n');
  files.push({ path: 'resources/index.ts', content: exports + '\n' });

  return files;
}

function generateResourceFile(resource: ParsedResource, componentNames: Set<string>): string {
  const lines: string[] = [];
  const { resourceImports, componentImports } = collectTypeImports(resource, componentNames);

  // Imports
  const importNames = ['FetchClient', 'FetchResponse'];
  const valueImportNames: string[] = [];
  const hasStreaming = resource.operations.some((op) => op.streamingFormat);
  if (hasStreaming) {
    importNames.push('StreamDescriptor');
    valueImportNames.push('createStreamDescriptor');
  }
  lines.push(`import type { ${importNames.join(', ')} } from '@vertz/fetch';`);
  if (valueImportNames.length > 0) {
    lines.push(`import { ${valueImportNames.join(', ')} } from '@vertz/fetch';`);
  }
  if (componentImports.size > 0) {
    const sorted = [...componentImports].sort();
    lines.push(`import type { ${sorted.join(', ')} } from '../types/components';`);
  }
  if (resourceImports.size > 0) {
    const sorted = [...resourceImports].sort();
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

    // Collect unique raw tags so the user knows the exact values for excludeTags
    const rawTags = [...new Set(resource.operations.flatMap((op) => op.tags))];
    const tagHint = rawTags.length > 0 ? ` (tags: ${rawTags.map((t) => `"${t}"`).join(', ')})` : '';

    throw new Error(
      `Duplicate method name${duplicates.length > 1 ? 's' : ''} ${duplicates.map(([n]) => `"${n}"`).join(', ')} in resource "${resource.name}"${tagHint}. ` +
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

  // No `signal` arg for streaming methods — the descriptor's _stream(signal)
  // factory takes the signal from query() at consumption time.

  return parts.join(', ');
}

function buildReturnType(op: ParsedOperation): string {
  if (op.streamingFormat) {
    const typeName = deriveStreamingTypeName(op);
    return `StreamDescriptor<${typeName}>`;
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
    const name = getTypePrefix(op) + 'Response';
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
  const innerProps: string[] = [
    `method: '${op.method}'`,
    `path: ${path}`,
    `format: '${op.streamingFormat}'`,
  ];
  if (op.requestBody) innerProps.push('body');
  if (op.queryParams.length > 0) innerProps.push('query');
  innerProps.push('signal');
  const innerCall = `client.requestStream<${typeName}>({ ${innerProps.join(', ')} })`;
  // createStreamDescriptor's 4th arg is used for cache-key derivation.
  // Pass query when present so two queries with different params produce
  // distinct keys (parity with REST descriptor key derivation).
  // Body is intentionally not in the key — it would require stable JSON
  // serialization and most stream consumers use GET with query params.
  // POST stream consumers with distinct bodies should use distinct paths.
  const keyArg = op.queryParams.length > 0 ? ', query' : '';
  return `createStreamDescriptor('${op.method}', ${path}, (signal) => ${innerCall}${keyArg})`;
}

function deriveStreamingTypeName(op: ParsedOperation): string {
  if (op.response?.name) return sanitizeTypeName(op.response.name);
  if (op.response) return getTypePrefix(op) + 'Event';
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

function collectTypeImports(
  resource: ParsedResource,
  componentNames: Set<string>,
): { resourceImports: Set<string>; componentImports: Set<string> } {
  const resourceImports = new Set<string>();
  const componentImports = new Set<string>();

  for (const op of resource.operations) {
    // Collect $circular refs that reference component schemas
    if (op.response) {
      for (const ref of collectCircularRefs(op.response.jsonSchema)) {
        if (componentNames.has(ref)) componentImports.add(ref);
      }
    }
    if (op.requestBody) {
      for (const ref of collectCircularRefs(op.requestBody.jsonSchema)) {
        if (componentNames.has(ref)) componentImports.add(ref);
      }
    }

    // Response type (streaming or standard)
    if (op.responseStatus !== 204 && op.response) {
      if (op.streamingFormat) {
        const streamTypeName = deriveStreamingTypeName(op);
        if (streamTypeName !== 'unknown') {
          if (componentNames.has(streamTypeName)) {
            componentImports.add(streamTypeName);
          } else {
            resourceImports.add(streamTypeName);
          }
        }
      } else {
        const name = op.response.name
          ? sanitizeTypeName(op.response.name)
          : getTypePrefix(op) + 'Response';
        if (componentNames.has(name)) {
          componentImports.add(name);
        } else {
          resourceImports.add(name);
        }
      }
    }

    // JSON response type for dual content
    if (op.jsonResponse) {
      const name = op.jsonResponse.name
        ? sanitizeTypeName(op.jsonResponse.name)
        : getTypePrefix(op) + 'Response';
      if (componentNames.has(name)) {
        componentImports.add(name);
      } else {
        resourceImports.add(name);
      }
    }

    // Input type
    if (op.requestBody) {
      const name = deriveInputName(op);
      if (componentNames.has(name)) {
        componentImports.add(name);
      } else {
        resourceImports.add(name);
      }
    }

    // Query type
    if (op.queryParams.length > 0) {
      resourceImports.add(deriveQueryName(op));
    }
  }

  return { resourceImports, componentImports };
}

function deriveInputName(op: ParsedOperation): string {
  if (op.requestBody?.name) return sanitizeTypeName(op.requestBody.name);
  return getTypePrefix(op) + 'Input';
}

function deriveQueryName(op: ParsedOperation): string {
  return getTypePrefix(op) + 'Query';
}
