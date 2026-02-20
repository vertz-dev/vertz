import { deepFreeze } from '@vertz/core';
import type { ModelDef } from '@vertz/db';
import type { EntityActionDef, EntityConfig, EntityDefinition } from './types';

const ENTITY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function entity<
  TModel extends ModelDef,
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty actions record
  TActions extends Record<string, EntityActionDef> = {},
>(name: string, config: EntityConfig<TModel, TActions>): EntityDefinition<TModel> {
  if (!name || !ENTITY_NAME_PATTERN.test(name)) {
    throw new Error(
      `entity() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  if (!config.model) {
    throw new Error('entity() requires a model in the config.');
  }

  return deepFreeze({
    name,
    model: config.model,
    access: config.access ?? {},
    before: config.before ?? {},
    after: config.after ?? {},
    actions: config.actions ?? {},
    relations: config.relations ?? {},
  });
}
