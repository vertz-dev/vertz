/**
 * Bridge adapter that wraps a DatabaseClient (query builder) and exposes
 * the EntityDbAdapter interface. This lets entity CRUD routes use the query
 * builder under the hood without changing any entity pipeline code.
 *
 * Part of the entity-query-builder unification (Phase 1).
 */

import type { DatabaseClient } from '../client/database';
import type { ModelEntry } from '../schema/inference';
import type { EntityDbAdapter } from '../types/adapter';

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
  type TEntry = TModels[TName];
  type TResponse = TEntry['table']['$response'];

  const delegate = db[tableName];

  return {
    async get(id, options?) {
      const getOptions: Record<string, unknown> = { where: { id } };
      if (options?.include) {
        getOptions.include = options.include;
      }
      const result = await delegate.get(getOptions as never);
      if (!result.ok) {
        return null;
      }
      return result.data as TResponse | null;
    },

    async list(options?) {
      const dbOptions: Record<string, unknown> = {};
      if (options?.where) {
        dbOptions.where = options.where;
      }
      if (options?.orderBy) {
        dbOptions.orderBy = options.orderBy;
      }
      if (options?.limit !== undefined) {
        dbOptions.limit = options.limit;
      }
      if (options?.include) {
        dbOptions.include = options.include;
      }
      const result = await delegate.listAndCount(dbOptions as never);
      if (!result.ok) {
        throw result.error;
      }
      return result.data as { data: TResponse[]; total: number };
    },

    async create(data) {
      const result = await delegate.create({ data } as never);
      if (!result.ok) {
        throw result.error;
      }
      return result.data as TResponse;
    },

    async update(id, data) {
      const result = await delegate.update({ where: { id }, data } as never);
      if (!result.ok) {
        throw result.error;
      }
      return result.data as TResponse;
    },

    async delete(id) {
      const result = await delegate.delete({ where: { id } } as never);
      if (!result.ok) {
        return null;
      }
      return result.data as TResponse | null;
    },
  };
}
