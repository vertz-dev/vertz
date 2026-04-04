/**
 * Bridge adapter that wraps a DatabaseClient (query builder) and exposes
 * the EntityDbAdapter interface. This lets entity CRUD routes use the query
 * builder under the hood without changing any entity pipeline code.
 *
 * Part of the entity-query-builder unification (Phase 1).
 */

import type { Result } from '@vertz/schema';
import type { DatabaseClient } from '../client/database';
import type { ReadError, WriteError } from '../errors';
import type { ModelEntry } from '../schema/inference';
import type { EntityDbAdapter } from '../types/adapter';

// ---------------------------------------------------------------------------
// BridgeDelegate — narrowed view of ModelDelegate for bridge adapter use.
//
// Widens input types to accept the structural shapes the bridge constructs.
// ModelDelegate methods use bounded generics with deferred conditional types
// (e.g., FilterType<EntryColumns<TEntry>>) that TypeScript can't evaluate for
// generic TEntry. This interface uses Record<string, unknown> for those fields,
// which is safe because the runtime delegate accepts Record<string, unknown>.
// ---------------------------------------------------------------------------

/** @internal */
interface BridgeDelegate {
  get(options?: {
    readonly where?: Record<string, unknown>;
    readonly include?: Record<string, unknown>;
  }): Promise<Result<unknown, ReadError>>;

  listAndCount(options?: {
    readonly where?: Record<string, unknown>;
    readonly orderBy?: Record<string, unknown>;
    readonly limit?: number;
    readonly include?: Record<string, unknown>;
    readonly cursor?: Record<string, unknown>;
  }): Promise<Result<unknown, ReadError>>;

  create(options: { readonly data: unknown }): Promise<Result<unknown, WriteError>>;

  update(options: {
    readonly where: Record<string, unknown>;
    readonly data: unknown;
  }): Promise<Result<unknown, WriteError>>;

  delete(options: {
    readonly where: Record<string, unknown>;
  }): Promise<Result<unknown, WriteError>>;
}

/**
 * Creates an EntityDbAdapter backed by a DatabaseClient for a specific table.
 *
 * Bridges the gap between the entity layer's simple adapter interface and the
 * query builder's rich, typed API. Unwraps Result<T, E> from the query builder
 * into the throw/return-null pattern expected by the entity pipeline.
 */
export function createDatabaseBridgeAdapter<
  TModels extends Record<string, ModelEntry>,
  TName extends keyof TModels & string,
>(db: DatabaseClient<TModels>, tableName: TName): EntityDbAdapter<TModels[TName]> {
  type TResponse = TModels[TName]['table']['$response'];

  const delegate = db[tableName] as BridgeDelegate;

  return {
    async get(id, options?) {
      const idWhere = typeof id === 'string' ? { id } : id;
      const result = await delegate.get({
        where: { ...(options?.where ?? {}), ...idWhere },
        ...(options?.include && { include: options.include }),
      });
      if (!result.ok) {
        return null;
      }
      return result.data as TResponse | null;
    },

    async list(options?) {
      const result = await delegate.listAndCount({
        ...(options?.where && { where: options.where }),
        ...(options?.orderBy && { orderBy: options.orderBy }),
        ...(options?.limit !== undefined && { limit: options.limit }),
        ...(options?.include && { include: options.include }),
        ...(options?.after && { cursor: { id: options.after } }),
      });
      if (!result.ok) {
        throw result.error;
      }
      return result.data as { data: TResponse[]; total: number };
    },

    async create(data) {
      const result = await delegate.create({ data });
      if (!result.ok) {
        throw result.error;
      }
      return result.data as TResponse;
    },

    async update(id, data, options?) {
      const idWhere = typeof id === 'string' ? { id } : id;
      const result = await delegate.update({
        where: { ...(options?.where ?? {}), ...idWhere },
        data,
      });
      if (!result.ok) {
        throw result.error;
      }
      return result.data as TResponse;
    },

    async delete(id, options?) {
      const idWhere = typeof id === 'string' ? { id } : id;
      const result = await delegate.delete({
        where: { ...(options?.where ?? {}), ...idWhere },
      });
      if (!result.ok) {
        return null;
      }
      return result.data as TResponse | null;
    },
  };
}
