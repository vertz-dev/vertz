import type { ModelDef } from '@vertz/db';
import type { ListOptions, ListResult } from './crud-pipeline';

/**
 * EntityOperations — typed CRUD facade for a single entity.
 *
 * When used as `ctx.entity`, TModel fills in actual column types.
 * When used as `ctx.entities.*`, TModel defaults to `ModelDef` (loose typing).
 */
export interface EntityOperations<TModel extends ModelDef = ModelDef> {
  get(id: string): Promise<TModel['table']['$response']>;
  list(options?: ListOptions): Promise<ListResult<TModel['table']['$response']>>;
  create(data: TModel['table']['$create_input']): Promise<TModel['table']['$response']>;
  update(id: string, data: TModel['table']['$update_input']): Promise<TModel['table']['$response']>;
  delete(id: string): Promise<void>;
}
