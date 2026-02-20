import type { ModelDef } from '@vertz/db';
import type { EntityActionDef, EntityConfig, EntityDefinition } from './types';

export function entity<
  TModel extends ModelDef,
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty actions record
  TActions extends Record<string, EntityActionDef> = {},
>(name: string, config: EntityConfig<TModel, TActions>): EntityDefinition<TModel> {
  return Object.freeze({
    name,
    model: config.model,
    access: config.access ?? {},
    before: config.before ?? {},
    after: config.after ?? {},
    actions: config.actions ?? {},
    relations: config.relations ?? {},
  });
}
