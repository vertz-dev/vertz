import { EntityForbiddenError, err, ok, type Result } from '@vertz/errors';
import type { AccessRule, EntityContext } from './types';

/**
 * Evaluates an access rule for the given operation.
 * Returns err(EntityForbiddenError) if access is denied.
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
): Promise<Result<void, EntityForbiddenError>> {
  const rule = accessRules[operation];

  // No rule defined → deny by default
  if (rule === undefined) {
    return err(
      new EntityForbiddenError(`Access denied: no access rule for operation "${operation}"`),
    );
  }

  // Explicitly disabled
  if (rule === false) {
    return err(new EntityForbiddenError(`Operation "${operation}" is disabled`));
  }

  // Function rule — evaluate
  const allowed = await rule(ctx, row ?? {});
  if (!allowed) {
    return err(new EntityForbiddenError(`Access denied for operation "${operation}"`));
  }

  return ok(undefined);
}
