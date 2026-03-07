import { deepFreeze } from '@vertz/core';
import type { EntityDefinition } from '../entity/types';
import type { ServiceActionDef, ServiceConfig, ServiceDefinition } from './types';

const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function service<
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities
  TInject extends Record<string, EntityDefinition> = {},
  // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
    ServiceActionDef<any, any, any>
  >,
>(name: string, config: ServiceConfig<TActions, TInject>): ServiceDefinition {
  if (!name || !SERVICE_NAME_PATTERN.test(name)) {
    throw new Error(
      `service() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  if (!config.actions || Object.keys(config.actions).length === 0) {
    throw new Error('service() requires at least one action in the actions config.');
  }

  const def: ServiceDefinition = {
    kind: 'service',
    name,
    inject: (config.inject ?? {}) as Record<string, EntityDefinition>,
    access: config.access ?? {},
    actions: config.actions as Record<string, ServiceActionDef>,
  };
  return deepFreeze(def);
}
