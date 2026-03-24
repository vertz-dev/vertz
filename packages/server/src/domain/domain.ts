import { deepFreeze } from '@vertz/core';
import type { DomainConfig, DomainDefinition } from './types';

const DOMAIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function domain(name: string, config: DomainConfig): DomainDefinition {
  if (!name || !DOMAIN_NAME_PATTERN.test(name)) {
    throw new Error(
      `domain() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  const entities = config.entities ?? [];
  const services = config.services ?? [];

  if (entities.length === 0 && services.length === 0) {
    throw new Error('domain() must have at least one entity or service.');
  }

  const def: DomainDefinition = {
    kind: 'domain',
    name,
    entities,
    services,
    middleware: config.middleware ?? [],
  };
  return deepFreeze(def);
}
