import type { TableEntry } from '@vertz/db';
import type { DomainDefinition, DomainOptions } from './types';
/**
 * STUB: domain() function for TDD red phase
 * This returns a properly shaped, frozen object that passes all structure tests.
 * Business logic (CRUD generation, access enforcement, etc.) will be implemented next.
 */
export declare function domain<TEntry extends TableEntry<any, any>>(
  name?: string,
  options?: DomainOptions<TEntry>,
): DomainDefinition<TEntry>;
//# sourceMappingURL=domain.d.ts.map
