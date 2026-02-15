// @vertz/server/domain - STUB for TDD red phase
// Minimal stub implementation to allow tests to run (and fail)
// Real implementation will replace this.

import type { TableEntry } from '@vertz/db';
import type { DomainDefinition, DomainOptions } from './types';

/**
 * STUB: domain() function for TDD red phase
 * This is a placeholder that returns a minimal object.
 * Tests will fail because the implementation is incomplete.
 */
export function domain<TEntry extends TableEntry<any, any>>(
  name: string,
  options: DomainOptions<TEntry>
): DomainDefinition<TEntry> {
  // STUB: Return minimal structure
  // Many tests will fail because this doesn't implement the full spec
  const def: DomainDefinition<TEntry> = {
    name,
    type: options.type,
    table: options.table,
    exposedRelations: options.expose || {},
    access: options.access || {},
    handlers: options.handlers || {},
    actions: options.actions || {},
  };
  
  // STUB: Not frozen - immutability test will fail
  return def;
}
