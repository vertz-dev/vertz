import type { EntityQueryMeta, QueryDescriptor } from '@vertz/fetch';

interface QueryRegistration {
  entityMeta: EntityQueryMeta;
  refetch: () => void;
}

/**
 * Active query registry — tracks entity-backed queries so they can be
 * invalidated externally via `invalidate(descriptor)`.
 */
const registry = new Set<QueryRegistration>();

/**
 * Register an active entity-backed query. Returns an unregister function.
 * Called by `query()` when entity metadata is present.
 * @internal
 */
export function registerActiveQuery(entityMeta: EntityQueryMeta, refetch: () => void): () => void {
  const registration: QueryRegistration = { entityMeta, refetch };
  registry.add(registration);
  return () => registry.delete(registration);
}

/**
 * Invalidate all active queries matching the descriptor's entity metadata.
 *
 * - List descriptors match ALL active list queries for that entity type
 *   (regardless of filter params).
 * - Get descriptors match by entity type + specific id.
 * - Descriptors without entity metadata are a no-op.
 *
 * Active queries are revalidated in the background (SWR pattern) —
 * existing data stays visible while the refetch happens.
 *
 * @example
 * ```ts
 * import { invalidate } from '@vertz/ui';
 *
 * // After a custom operation not covered by optimistic updates:
 * invalidate(api.todos.list());      // revalidates all active todo list queries
 * invalidate(api.todos.get('123'));   // revalidates the specific get query
 * ```
 */
export function invalidate<T, E>(descriptor: QueryDescriptor<T, E>): void {
  const meta = descriptor._entity;
  if (!meta) return;

  // Get descriptors require an id to match — a get descriptor without
  // an id is ambiguous and treated as a no-op.
  if (meta.kind === 'get' && !meta.id) return;

  // Snapshot the registry to avoid re-entrancy issues if refetch()
  // triggers synchronous effects that modify the registry.
  for (const reg of [...registry]) {
    if (reg.entityMeta.entityType !== meta.entityType) continue;
    if (reg.entityMeta.kind !== meta.kind) continue;
    if (meta.kind === 'get' && reg.entityMeta.id !== meta.id) continue;
    reg.refetch();
  }
}

/**
 * Exposed for testing — returns the current number of registered queries.
 * @internal
 */
export function __registrySize(): number {
  return registry.size;
}

/**
 * Clear the active query registry.
 * @internal — test utility only, not part of the public API.
 * Ensures clean state between test cases.
 */
export function resetQueryRegistry(): void {
  registry.clear();
}
