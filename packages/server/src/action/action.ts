import { deepFreeze } from '@vertz/core';
import type { EntityDefinition } from '../entity/types';
import type { ActionActionDef, ActionConfig, ActionDefinition } from './types';

const ACTION_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function action<
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities
  TInject extends Record<string, EntityDefinition> = {},
  // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ActionActionDef<any, any, any>> = Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
    ActionActionDef<any, any, any>
  >,
>(name: string, config: ActionConfig<TActions, TInject>): ActionDefinition {
  if (!name || !ACTION_NAME_PATTERN.test(name)) {
    throw new Error(
      `action() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  if (!config.actions || Object.keys(config.actions).length === 0) {
    throw new Error('action() requires at least one action in the actions config.');
  }

  const def: ActionDefinition = {
    kind: 'action',
    name,
    inject: (config.inject ?? {}) as Record<string, EntityDefinition>,
    access: config.access ?? {},
    actions: config.actions as Record<string, ActionActionDef>,
  };
  return deepFreeze(def);
}
