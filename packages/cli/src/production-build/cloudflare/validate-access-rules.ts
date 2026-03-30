/**
 * validateAccessRules — build-time validation that all entity operations have access rules
 *
 * Missing access rules (kind: 'none') are treated as a build error for production targets.
 * Explicitly denied access (kind: 'false') is valid — the developer intentionally disabled it.
 * Function-based rules (kind: 'function') are valid — runtime evaluation.
 */

import type { EntityIR } from '@vertz/compiler';

const CRUD_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const;

export function validateAccessRules(entities: EntityIR[]): string[] {
  const errors: string[] = [];

  for (const entity of entities) {
    for (const op of CRUD_OPERATIONS) {
      if (entity.access[op] === 'none') {
        errors.push(
          `Entity '${entity.name}' has no access rule for '${op}'. ` +
            `Define a rule or use rules.public for open access.`,
        );
      }
    }
  }

  return errors;
}
