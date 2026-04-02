import { groupOperations } from './adapter/resource-grouper';
import type { OpenAPIConfig } from './config';
import { generateAll } from './generators/index';
import { loadSpec } from './loader';
import { normalizeOperationId } from './parser/operation-id-normalizer';
import { parseOpenAPI } from './parser/openapi-parser';
import type { ParsedSpec } from './parser/types';
import { writeIncremental } from './writer/incremental';
import type { WriteResult } from './writer/incremental';

/**
 * Generate a typed SDK from an OpenAPI spec.
 * This is the main programmatic API.
 */
export async function generateFromOpenAPI(
  config: OpenAPIConfig & { dryRun?: boolean },
): Promise<WriteResult> {
  // 1. Load the spec
  const raw = await loadSpec(config.source);

  // 2. Parse and validate
  const parsed = parseOpenAPI(raw);

  // 3. Apply operationIds normalization if configured
  if (config.operationIds) {
    for (const op of parsed.operations) {
      op.methodName = normalizeOperationId(
        op.operationId,
        op.method,
        op.path,
        config.operationIds,
        {
          operationId: op.operationId,
          method: op.method,
          path: op.path,
          tags: op.tags,
          hasBody: op.requestBody !== undefined,
        },
      );
    }
  }

  // 4. Group into resources (with optional tag exclusion)
  const resources = groupOperations(parsed.operations, config.groupBy, {
    excludeTags: config.excludeTags,
  });

  // 5. Build ParsedSpec
  const info = raw.info as Record<string, unknown> | undefined;
  const spec: ParsedSpec = {
    version: parsed.version,
    info: {
      title: typeof info?.title === 'string' ? info.title : 'Unknown',
      version: typeof info?.version === 'string' ? info.version : '0.0.0',
    },
    resources,
    schemas: parsed.schemas,
  };

  // 6. Generate files
  const files = generateAll(spec, {
    schemas: config.schemas,
    baseURL: config.baseURL,
  });

  // 7. Write to disk
  return writeIncremental(files, config.output, {
    clean: true,
    dryRun: config.dryRun,
  });
}
