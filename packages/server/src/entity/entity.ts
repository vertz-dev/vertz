import { deepFreeze } from '@vertz/core';
import type { ModelDef, RelationDef } from '@vertz/db';
import type { EntityActionDef, EntityConfig, EntityContext, EntityDefinition } from './types';

const ENTITY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Resolves the tenant FK column name from a model's `_tenant` relation. */
function resolveTenantColumn(model: ModelDef): string | null {
  if (!model._tenant) return null;
  const relations = model.relations as Record<string, RelationDef>;
  const tenantRel = relations[model._tenant];
  if (!tenantRel || !tenantRel._foreignKey) return null;
  return tenantRel._foreignKey;
}

export function entity<
  TModel extends ModelDef,
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities
  TInject extends Record<string, EntityDefinition> = {},
  TActions extends Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: TInput/TOutput must remain any — TypeScript infers concrete types from SchemaLike per-action
    EntityActionDef<any, any, TModel['table']['$response'], EntityContext<TModel, TInject>>
    // biome-ignore lint/complexity/noBannedTypes: {} represents an empty actions record
  > = {},
>(name: string, config: EntityConfig<TModel, TActions, TInject>): EntityDefinition<TModel> {
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
  const def: EntityDefinition<TModel> = {
    kind: 'entity',
    name,
    model: config.model,
    inject: (config.inject ?? {}) as Record<string, EntityDefinition>,
    access: config.access ?? {},
    before: (config.before ?? {}) as EntityDefinition<TModel>['before'],
    after: (config.after ?? {}) as EntityDefinition<TModel>['after'],
    actions: (config.actions ?? {}) as Record<string, EntityActionDef>,
    expose: config.expose,
    table: config.table ?? name,
    tenantScoped,
    tenantColumn: tenantScoped ? (tenantColumn ?? 'tenantId') : null,
    tenantChain: null,
  };
  return deepFreeze(def);
}
