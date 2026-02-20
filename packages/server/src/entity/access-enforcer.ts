import { ForbiddenException } from '@vertz/core';
import type { AccessRule, EntityContext } from './types';

/**
 * Evaluates an access rule for the given operation.
 * Throws ForbiddenException if access is denied.
 *
 * - No rule defined → deny (deny by default)
 * - Rule is false → operation is disabled
 * - Rule is a function → evaluate and deny if returns false
 */
export async function enforceAccess(
  operation: string,
  accessRules: Partial<Record<string, AccessRule>>,
  ctx: EntityContext,
  row?: Record<string, unknown>,
): Promise<void> {
  const rule = accessRules[operation];

  // No rule defined → deny by default
  if (rule === undefined) {
    throw new ForbiddenException(`Access denied: no access rule for operation "${operation}"`);
  }

  // Explicitly disabled
  if (rule === false) {
    throw new ForbiddenException(`Operation "${operation}" is disabled`);
  }

  // Function rule — evaluate
  const allowed = await rule(ctx, row ?? {});
  if (!allowed) {
    throw new ForbiddenException(`Access denied for operation "${operation}"`);
  }
}
