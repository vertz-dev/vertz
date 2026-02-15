/**
 * Domain definition utilities for DB client codegen.
 */

import type { DomainDefinition, DomainField, DomainRelation } from './codegen/type-gen';

/**
 * Define a domain for DB client codegen.
 * This creates a domain definition that can be used to generate types and client.
 */
export function defineDomain(
  name: string,
  config: {
    fields: Record<string, Omit<DomainField, 'type'> & { type: DomainField['type'] }>;
    relations?: Record<string, Omit<DomainRelation, 'type'> & { type: DomainRelation['type'] }>;
  },
): DomainDefinition {
  return {
    name,
    fields: config.fields as Record<string, DomainField>,
    relations: config.relations as Record<string, DomainRelation> | undefined,
  };
}

export type { DomainDefinition, DomainField, DomainRelation } from './codegen/type-gen';
export { generateTypes, generateClient } from './codegen';
