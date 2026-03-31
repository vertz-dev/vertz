/**
 * Manifest-driven descriptor reconstruction for zero-discovery SSR.
 *
 * Given manifest query entries + route params + the API client, produces
 * real QueryDescriptors by calling the code-generated SDK factories directly.
 * This avoids duplicating key construction logic (resolveVertzQL, serializeQuery).
 */
import type { ExtractedQuery, QueryBindings } from './compiler/prefetch-manifest';

export interface ReconstructedDescriptor {
  key: string;
  fetch: () => Promise<unknown>;
}

/**
 * Reconstruct QueryDescriptors from manifest metadata by calling the
 * real API client factories. Returns descriptors with correct `_key`
 * and `_fetch` for pre-populating the SSR query cache.
 *
 * Skips queries that:
 * - Have no entity/operation (variable references)
 * - Reference entities or operations not in the API client
 * - Have unresolvable where bindings (null = dynamic value)
 * - Reference route params not present in the URL
 */
export function reconstructDescriptors(
  queries: ExtractedQuery[],
  routeParams: Record<string, string>,
  apiClient: Record<string, Record<string, (...args: unknown[]) => unknown>> | undefined,
): ReconstructedDescriptor[] {
  if (!apiClient) return [];

  const result: ReconstructedDescriptor[] = [];

  for (const query of queries) {
    const descriptor = reconstructSingle(query, routeParams, apiClient);
    if (descriptor) {
      result.push(descriptor);
    }
  }

  return result;
}

function reconstructSingle(
  query: ExtractedQuery,
  routeParams: Record<string, string>,
  apiClient: Record<string, Record<string, (...args: unknown[]) => unknown>>,
): ReconstructedDescriptor | undefined {
  const { entity, operation } = query;
  if (!entity || !operation) return undefined;

  // Look up the entity SDK and operation method
  const entitySdk = apiClient[entity];
  if (!entitySdk) return undefined;

  const method = entitySdk[operation];
  if (typeof method !== 'function') return undefined;

  // Build arguments for the descriptor factory call
  const args = buildFactoryArgs(query, routeParams);
  if (args === undefined) return undefined; // Unresolvable bindings

  // Call the real descriptor factory
  try {
    const descriptor = method(...args) as { _key?: string; _fetch?: () => Promise<unknown> };
    if (
      !descriptor ||
      typeof descriptor._key !== 'string' ||
      typeof descriptor._fetch !== 'function'
    ) {
      return undefined;
    }
    return { key: descriptor._key, fetch: descriptor._fetch };
  } catch {
    return undefined; // Factory call failed — skip this query
  }
}

/**
 * Build the arguments array for a descriptor factory call from manifest bindings.
 *
 * - get(id) → [id]
 * - get(id, { select: {...} }) → [id, { select: {...} }]
 * - list() → []
 * - list({ where: {...}, select: {...} }) → [{ where: {...}, select: {...} }]
 *
 * Returns undefined if any binding cannot be resolved (missing route param, null where value).
 */
function buildFactoryArgs(
  query: ExtractedQuery,
  routeParams: Record<string, string>,
): unknown[] | undefined {
  const { operation, idParam, queryBindings } = query;

  if (operation === 'get') {
    // get(id) or get(id, options)
    if (idParam) {
      const id = routeParams[idParam];
      if (!id) return undefined; // Route param not in URL
      const options = resolveQueryBindings(queryBindings, routeParams);
      if (options === undefined && queryBindings) return undefined; // Unresolvable
      return options ? [id, options] : [id];
    }
    // get without idParam — unusual, skip
    return undefined;
  }

  // list() or list(query)
  if (!queryBindings) return [];

  const resolved = resolveQueryBindings(queryBindings, routeParams);
  if (resolved === undefined) return undefined; // Unresolvable
  return [resolved];
}

/**
 * Resolve query bindings by replacing $param references with actual route param values.
 * Returns undefined if any binding cannot be resolved.
 */
function resolveQueryBindings(
  bindings: QueryBindings | undefined,
  routeParams: Record<string, string>,
): Record<string, unknown> | undefined {
  if (!bindings) return undefined;

  const resolved: Record<string, unknown> = {};

  if (bindings.where) {
    const where: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bindings.where)) {
      if (value === null) return undefined; // Dynamic value — cannot resolve
      if (typeof value === 'string' && value.startsWith('$')) {
        const paramName = value.slice(1);
        const paramValue = routeParams[paramName];
        if (!paramValue) return undefined; // Missing route param
        where[key] = paramValue;
      } else {
        where[key] = value; // Static value
      }
    }
    resolved.where = where;
  }

  if (bindings.select) resolved.select = bindings.select;
  if (bindings.include) resolved.include = bindings.include;
  if (bindings.orderBy) resolved.orderBy = bindings.orderBy;
  if (bindings.limit !== undefined) resolved.limit = bindings.limit;

  return resolved;
}
