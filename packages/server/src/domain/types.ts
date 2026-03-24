import type { NamedMiddlewareDef } from '@vertz/core';
import type { EntityDefinition } from '../entity/types';
import type { ServiceDefinition } from '../service/types';

export interface DomainConfig {
  readonly entities?: EntityDefinition[];
  readonly services?: ServiceDefinition[];
  readonly middleware?: NamedMiddlewareDef[];
}

export interface DomainDefinition {
  readonly kind: 'domain';
  readonly name: string;
  readonly entities: EntityDefinition[];
  readonly services: ServiceDefinition[];
  readonly middleware: NamedMiddlewareDef[];
}
