import { deepFreeze } from '@vertz/core';
import type { EntityDefinition } from '../entity/types';
import type { ServiceActionDef, ServiceConfig, ServiceContext, ServiceDefinition } from './types';

const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function service<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities
  TInject extends Record<string, EntityDefinition> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any — TypeScript contextual typing limitation
  TActions extends Record<string, ServiceActionDef<any, any, ServiceContext<TInject>>> = Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any — TypeScript contextual typing limitation
    ServiceActionDef<any, any, ServiceContext<TInject>>
  >,
>(name: string, config: ServiceConfig<TActions, TInject>): ServiceDefinition<TActions> {
  if (!name || !SERVICE_NAME_PATTERN.test(name)) {
    throw new Error(
      `service() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  if (!config.actions || Object.keys(config.actions).length === 0) {
    throw new Error('service() requires at least one action in the actions config.');
  }

  const def: ServiceDefinition<TActions> = {
    kind: 'service',
    name,
    inject: (config.inject ?? {}) as Record<string, EntityDefinition>,
    access: config.access ?? {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-erased at runtime; concrete types preserved in __actions phantom
    actions: config.actions as Record<string, ServiceActionDef<any, any, any>>,
  };
  return deepFreeze(def);
}
