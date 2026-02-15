// @vertz/server/domain - STUB for TDD red phase
// Minimal stub implementation to allow tests to pass structure/contract tests
// Real implementation will replace this with full business logic.

import type { TableEntry } from '@vertz/db';
import type { DomainDefinition, DomainOptions } from './types';

/**
 * STUB: domain() function for TDD red phase
 * This returns a properly shaped, frozen object that passes all structure tests.
 * Business logic (CRUD generation, access enforcement, etc.) will be implemented next.
 */
export function domain<TEntry extends TableEntry<any, any>>(
  name: string,
  options: DomainOptions<TEntry>
): DomainDefinition<TEntry> {
  // STUB: Build definition object
  const def: DomainDefinition<TEntry> = {
    name,
    type: options.type,
    table: options.table,
    exposedRelations: options.expose || {},
    access: options.access || {},
    handlers: options.handlers || {},
    actions: options.actions || {},
  };
  
  // Freeze to make immutable (satisfy immutability tests)
  return Object.freeze(def);
}
