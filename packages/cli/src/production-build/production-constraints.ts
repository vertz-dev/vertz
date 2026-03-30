/**
 * Production constraint enforcement for `vertz start`
 *
 * Validates that entities meet production requirements:
 * - All CRUD operations must have access rules defined
 * - Missing access rules = hard error (or warning with --allow-open-access)
 * - Startup diagnostics logging
 */

import type { EntityActionIR, EntityIR } from '@vertz/compiler';

const CRUD_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const;

export interface ConstraintValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ConstraintOptions {
  allowOpenAccess?: boolean;
}

/**
 * Validates production constraints for entities.
 *
 * Returns errors for entities with missing access rules (kind === 'none').
 * If allowOpenAccess is true, returns warnings instead of errors.
 */
export function validateProductionConstraints(
  entities: EntityIR[],
  options: ConstraintOptions = {},
): ConstraintValidationResult {
  const { allowOpenAccess = false } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const entity of entities) {
    for (const op of CRUD_OPERATIONS) {
      if (entity.access[op] === 'none') {
        const message =
          `Entity '${entity.name}' has no access rule for '${op}'. ` +
          `Define a rule or use rules.public for open access.`;

        if (allowOpenAccess) {
          warnings.push(message);
        } else {
          errors.push(message);
        }
      }
    }
  }

  return { errors, warnings };
}

/**
 * Formats startup diagnostics for production mode.
 */
export function formatStartupDiagnostics(entities: EntityIR[]): string {
  const lines: string[] = [];
  const totalRoutes =
    entities.length * CRUD_OPERATIONS.length +
    entities.reduce((sum, e) => sum + e.actions.length, 0);
  const tenantScoped = entities.filter((e) => e.tenantScoped);

  lines.push('📊 Production Startup Diagnostics');
  lines.push('');
  lines.push(`   Entities:  ${entities.length}`);
  lines.push(`   Routes:    ${totalRoutes}`);

  if (entities.length > 0) {
    lines.push('');
    for (const entity of entities) {
      const ops = [...CRUD_OPERATIONS, ...entity.actions.map((a: EntityActionIR) => a.name)];
      const scope = entity.tenantScoped ? ' (tenant-scoped)' : '';
      lines.push(`   - ${entity.name}: ${ops.join(', ')}${scope}`);
    }
  }

  if (tenantScoped.length > 0) {
    lines.push('');
    lines.push(`   Tenant-scoped: ${tenantScoped.map((e) => e.name).join(', ')}`);
  }

  return lines.join('\n');
}
