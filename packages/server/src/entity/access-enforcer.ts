import { EntityForbiddenError, err, ok, type Result } from '@vertz/errors';
import type { AccessRule as AuthAccessRule, UserMarker } from '../auth/rules';
import type { AccessRule, BaseContext } from './types';

// ---------------------------------------------------------------------------
// Enforce access options — optional hooks for entitlement/FVA evaluation
// ---------------------------------------------------------------------------

export interface EnforceAccessOptions {
  /** Evaluate an entitlement via the access context (defineAccess) */
  readonly can?: (entitlement: string) => Promise<boolean>;
  /** Seconds since last MFA verification (for rules.fva) */
  readonly fvaAge?: number;
}

// ---------------------------------------------------------------------------
// Rule evaluator — recursive dispatch on descriptor type
// ---------------------------------------------------------------------------

function deny(operation: string): Result<void, EntityForbiddenError> {
  return err(new EntityForbiddenError(`Access denied for operation "${operation}"`));
}

function isUserMarker(value: unknown): value is UserMarker {
  return typeof value === 'object' && value !== null && '__marker' in value;
}

function resolveMarker(marker: UserMarker, ctx: BaseContext): unknown {
  switch (marker.__marker) {
    case 'user.id':
      return ctx.userId;
    case 'user.tenantId':
      return ctx.tenantId;
    default:
      return undefined;
  }
}

async function evaluateRule(
  rule: AuthAccessRule,
  operation: string,
  ctx: BaseContext,
  row: Record<string, unknown>,
  options: EnforceAccessOptions,
): Promise<Result<void, EntityForbiddenError>> {
  switch (rule.type) {
    case 'public':
      return ok(undefined);

    case 'authenticated':
      return ctx.authenticated() ? ok(undefined) : deny(operation);

    case 'role':
      return ctx.role(...rule.roles) ? ok(undefined) : deny(operation);

    case 'entitlement': {
      if (!options.can) {
        return deny(operation);
      }
      const allowed = await options.can(rule.entitlement);
      return allowed ? ok(undefined) : deny(operation);
    }

    case 'where': {
      for (const [key, expected] of Object.entries(rule.conditions)) {
        const resolved = isUserMarker(expected) ? resolveMarker(expected, ctx) : expected;
        if (row[key] !== resolved) {
          return deny(operation);
        }
      }
      return ok(undefined);
    }

    case 'all': {
      for (const sub of rule.rules) {
        const result = await evaluateDescriptor(sub, operation, ctx, row, options);
        if (!result.ok) return result;
      }
      return ok(undefined);
    }

    case 'any': {
      for (const sub of rule.rules) {
        const result = await evaluateDescriptor(sub, operation, ctx, row, options);
        if (result.ok) return result;
      }
      return deny(operation);
    }

    case 'fva': {
      if (options.fvaAge === undefined) {
        return deny(operation);
      }
      return options.fvaAge <= rule.maxAge ? ok(undefined) : deny(operation);
    }
  }
}

async function evaluateDescriptor(
  rule: Exclude<AccessRule, false>,
  operation: string,
  ctx: BaseContext,
  row: Record<string, unknown>,
  options: EnforceAccessOptions,
): Promise<Result<void, EntityForbiddenError>> {
  if (typeof rule === 'function') {
    const allowed = await rule(ctx, row);
    return allowed ? ok(undefined) : deny(operation);
  }
  return evaluateRule(rule, operation, ctx, row, options);
}

// ---------------------------------------------------------------------------
// skipWhere variants — where rules treated as ok() when pushed to DB
// ---------------------------------------------------------------------------

async function evaluateRuleSkipWhere(
  rule: AuthAccessRule,
  operation: string,
  ctx: BaseContext,
  row: Record<string, unknown>,
  options: EnforceAccessOptions,
): Promise<Result<void, EntityForbiddenError>> {
  if (rule.type === 'where') {
    return ok(undefined); // Already enforced at DB level
  }
  if (rule.type === 'all') {
    for (const sub of rule.rules) {
      const result = await evaluateDescriptorSkipWhere(sub, operation, ctx, row, options);
      if (!result.ok) return result;
    }
    return ok(undefined);
  }
  if (rule.type === 'any') {
    // INVARIANT: where rules inside 'any' are NEVER extracted to DB
    // (extractFromDescriptor returns null for 'any'). Evaluate with the
    // regular evaluator so where conditions are checked in-memory.
    for (const sub of rule.rules) {
      const result = await evaluateDescriptor(sub, operation, ctx, row, options);
      if (result.ok) return result;
    }
    return deny(operation);
  }
  return evaluateRule(rule, operation, ctx, row, options);
}

async function evaluateDescriptorSkipWhere(
  rule: Exclude<AccessRule, false>,
  operation: string,
  ctx: BaseContext,
  row: Record<string, unknown>,
  options: EnforceAccessOptions,
): Promise<Result<void, EntityForbiddenError>> {
  if (typeof rule === 'function') {
    const allowed = await rule(ctx, row);
    return allowed ? ok(undefined) : deny(operation);
  }
  return evaluateRuleSkipWhere(rule, operation, ctx, row, options);
}

// ---------------------------------------------------------------------------
// Where condition extraction — pushes rules.where() to DB queries
// ---------------------------------------------------------------------------

/**
 * Extracts resolved WHERE conditions from a descriptor rule tree.
 * Recursively walks `all` rules to collect `where` conditions.
 * Resolves UserMarker values using the provided context.
 *
 * Returns null if the rule contains no extractable where conditions.
 */
function extractFromDescriptor(
  rule: Exclude<AccessRule, false>,
  ctx: BaseContext,
): Record<string, unknown> | null {
  // Function rules are opaque — can't extract static conditions
  if (typeof rule === 'function') return null;

  switch (rule.type) {
    case 'where': {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rule.conditions)) {
        resolved[key] = isUserMarker(value) ? resolveMarker(value, ctx) : value;
      }
      return resolved;
    }

    case 'all': {
      // Collect where conditions from all sub-rules (AND composition)
      let merged: Record<string, unknown> | null = null;
      for (const sub of rule.rules) {
        const extracted = extractFromDescriptor(sub, ctx);
        if (extracted) {
          merged = { ...(merged ?? {}), ...extracted };
        }
      }
      return merged;
    }

    default:
      // INVARIANT: Do NOT extract from 'any'. evaluateRuleSkipWhere treats
      // skipped where branches as ok(), which would short-circuit OR evaluation
      // and silently grant access. 'any' with 'where' must be evaluated in-memory.
      return null;
  }
}

/**
 * Extracts DB-level WHERE conditions from an access rule for a given operation.
 * Used by the CRUD pipeline to push rules.where() conditions into DB queries.
 *
 * Returns null if the rule has no extractable where conditions.
 */
export function extractWhereConditions(
  operation: string,
  accessRules: Partial<Record<string, AccessRule>>,
  ctx: BaseContext,
): Record<string, unknown> | null {
  const rule = accessRules[operation];
  if (rule === undefined || rule === false) return null;
  return extractFromDescriptor(rule, ctx);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates an access rule for the given operation.
 * Returns err(EntityForbiddenError) if access is denied.
 *
 * Accepts BaseContext so both EntityContext and ServiceContext can use it.
 *
 * - No rule defined → deny (deny by default)
 * - Rule is false → operation is disabled
 * - Descriptor rule → dispatch by type
 * - Function rule → evaluate and deny if returns false
 *
 * When `skipWhere` is true, `where` rules are treated as ok() — used
 * when where conditions have already been pushed to the DB query.
 */
export async function enforceAccess(
  operation: string,
  accessRules: Partial<Record<string, AccessRule>>,
  ctx: BaseContext,
  row?: Record<string, unknown>,
  options?: EnforceAccessOptions & { skipWhere?: boolean },
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

  if (options?.skipWhere) {
    return evaluateDescriptorSkipWhere(rule, operation, ctx, row ?? {}, options);
  }
  return evaluateDescriptor(rule, operation, ctx, row ?? {}, options ?? {});
}
