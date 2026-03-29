import { deepFreeze } from '@vertz/core';
import type { ModelDef, RelationDef } from '@vertz/db';
import type { EntityActionDef, EntityConfig, EntityContext, EntityDefinition } from './types';

const ENTITY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Resolves the tenant FK column name by scanning ref.one relations for the root table. */
function resolveTenantColumn(model: ModelDef): string | null {
  const relations = model.relations as Record<string, RelationDef>;
  for (const rel of Object.values(relations)) {
    if (rel._type === 'one' && rel._foreignKey && rel._target()._tenant) {
      return rel._foreignKey;
    }
  }
  return null;
}

export function entity<
  TModel extends ModelDef,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities
  TInject extends Record<string, EntityDefinition> = {},
  TActions extends Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any — TypeScript infers concrete types from SchemaLike per-action
    EntityActionDef<any, any, TModel['table']['$response'], EntityContext<TModel, TInject>>
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents an empty actions record
  > = {},
>(
  name: string,
  config: EntityConfig<TModel, TActions, TInject>,
): EntityDefinition<TModel, TActions> {
  if (!name || !ENTITY_NAME_PATTERN.test(name)) {
    throw new Error(
      `entity() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  if (!config.model) {
    throw new Error('entity() requires a model in the config.');
  }

  // Resolve tenant column from the model's _tenant relation FK, or fallback to 'tenantId' column
  const tenantColumn = resolveTenantColumn(config.model);
  const hasTenantColumn = tenantColumn !== null || 'tenantId' in config.model.table._columns;
  const tenantScoped = config.tenantScoped ?? hasTenantColumn;

  // Type erasure: EntityConfig<TModel> validates hooks at the call site.
  // EntityDefinition stores hooks as EntityBeforeHooks/EntityAfterHooks (unknown)
  // so that definitions with different models can coexist in a single array.
  const def: EntityDefinition<TModel, TActions> = {
    kind: 'entity',
    name,
    model: config.model,
    inject: (config.inject ?? {}) as Record<string, EntityDefinition>,
    access: config.access ?? {},
    before: (config.before ?? {}) as EntityDefinition<TModel, TActions>['before'],
    after: (config.after ?? {}) as EntityDefinition<TModel, TActions>['after'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-erased at runtime; concrete types preserved in __actions phantom
    actions: (config.actions ?? {}) as Record<string, EntityActionDef<any, any, any, any>>,
    expose: config.expose,
    table: config.table ?? name,
    tenantScoped,
    tenantColumn: tenantScoped ? (tenantColumn ?? 'tenantId') : null,
    tenantChain: null,
  };
  return deepFreeze(def);
}
