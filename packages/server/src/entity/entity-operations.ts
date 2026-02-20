import type { ModelDef } from '@vertz/db';

/**
 * EntityOperations — typed CRUD facade for a single entity.
 *
 * When used as `ctx.entity`, TModel fills in actual column types.
 * When used as `ctx.entities.*`, TModel defaults to `ModelDef` (loose typing).
 */
export interface EntityOperations<TModel extends ModelDef = ModelDef> {
  get(id: string): Promise<TModel['table']['$response']>;
  list(options?: {
    where?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    /** Cursor-based pagination: fetch records after this ID. Takes precedence over offset. */
    after?: string;
  }): Promise<TModel['table']['$response'][]>;
  create(data: TModel['table']['$create_input']): Promise<TModel['table']['$response']>;
  update(id: string, data: TModel['table']['$update_input']): Promise<TModel['table']['$response']>;
  delete(id: string): Promise<void>;
}
