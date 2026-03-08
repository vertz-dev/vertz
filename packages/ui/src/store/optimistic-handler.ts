import type { MutationMeta, OptimisticHandler } from '@vertz/fetch';
import type { EntityStore } from './entity-store';
import type { MutationEventBus } from './mutation-event-bus';
import { getMutationEventBus } from './mutation-event-bus-singleton';

export interface OptimisticHandlerOptions {
  /** Custom MutationEventBus instance. Defaults to the singleton bus. */
  mutationEventBus?: MutationEventBus;
}

/**
 * Create an OptimisticHandler that bridges @vertz/fetch mutations
 * to EntityStore's optimistic layer API.
 *
 * By default, emits mutation events to the singleton MutationEventBus
 * so that entity-backed queries revalidate automatically.
 */
export function createOptimisticHandler(
  store: EntityStore,
  options?: OptimisticHandlerOptions,
): OptimisticHandler {
  const bus = options?.mutationEventBus ?? getMutationEventBus();
  return {
    apply(meta: MutationMeta, mutationId: string): (() => void) | undefined {
      const { entityType, kind, id, body } = meta;

      if (kind === 'update' && id && body) {
        store.applyLayer(entityType, id, mutationId, body as Record<string, unknown>);
        return () => store.rollbackLayer(entityType, id, mutationId);
      }

      if (kind === 'delete' && id) {
        // Snapshot entity and query indices for rollback
        const entitySnapshot = store.get(entityType, id).peek();
        const indexSnapshot = store.queryIndices.snapshotEntity(id);
        store.removeOptimistic(entityType, id, mutationId);
        return () =>
          store.restoreOptimistic(entityType, id, mutationId, entitySnapshot, indexSnapshot);
      }

      return undefined;
    },

    commit(meta: MutationMeta, mutationId: string, data: unknown): void {
      const { entityType, kind, id } = meta;

      if (kind === 'update' && id) {
        store.commitLayer(entityType, id, mutationId, data as Record<string, unknown>);
      }
      // For delete: entity already removed optimistically, no-op on commit
      // For create: server returns the new entity — merge it into the store
      if (kind === 'create' && data && typeof data === 'object' && 'id' in data) {
        store.merge(entityType, data as { id: string });
      }

      if (!meta.skipInvalidation) {
        bus.emit(entityType);
      }
    },
  };
}
