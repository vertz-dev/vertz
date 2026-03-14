import type { AccessRule as AuthAccessRule } from '../auth/rules';
import type { EnforceAccessOptions } from './access-enforcer';
import type { BaseContext } from './types';

// ---------------------------------------------------------------------------
// Expose descriptor evaluation result
// ---------------------------------------------------------------------------

export interface EvaluatedExpose {
  /** Fields the user is allowed to see (includes both true and passed descriptors). */
  readonly allowedSelectFields: Set<string>;
  /** Fields present in select but whose descriptor failed — these return null. */
  readonly nulledFields: Set<string>;
  /** Fields the user can filter on (from allowWhere). */
  readonly allowedWhereFields: Set<string>;
  /** Fields the user can sort on (from allowOrderBy). */
  readonly allowedOrderByFields: Set<string>;
}

// ---------------------------------------------------------------------------
// Expose config shape (subset of ExposeConfig relevant for evaluation)
// ---------------------------------------------------------------------------

export interface ExposeEvalConfig {
  readonly select: Record<string, true | AuthAccessRule>;
  readonly allowWhere?: Record<string, true | AuthAccessRule>;
  readonly allowOrderBy?: Record<string, true | AuthAccessRule>;
}

// ---------------------------------------------------------------------------
// Rule evaluation — user-level only, no row context needed
// ---------------------------------------------------------------------------

/**
 * Evaluates an AuthAccessRule against a BaseContext.
 * Returns true if the rule is satisfied, false otherwise.
 *
 * Expose descriptors only check user-level attributes (roles, entitlements,
 * authentication, FVA), not row-level conditions. Where rules are not
 * applicable in expose context and always return false.
 */
async function evaluateExposeRule(
  rule: AuthAccessRule,
  ctx: BaseContext,
  options: EnforceAccessOptions,
): Promise<boolean> {
  switch (rule.type) {
    case 'public':
      return true;

    case 'authenticated':
      return ctx.authenticated();

    case 'role':
      return ctx.role(...rule.roles);

    case 'entitlement': {
      if (!options.can) return false;
      return options.can(rule.entitlement);
    }

    case 'where':
      // Where rules are row-level — not applicable in expose context
      return false;

    case 'all': {
      for (const sub of rule.rules) {
        if (!(await evaluateExposeRule(sub, ctx, options))) return false;
      }
      return true;
    }

    case 'any': {
      for (const sub of rule.rules) {
        if (await evaluateExposeRule(sub, ctx, options)) return true;
      }
      return false;
    }

    case 'fva': {
      if (options.fvaAge === undefined) return false;
      return options.fvaAge <= rule.maxAge;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pre-evaluates all AccessRule descriptors in an expose config against
 * the current request context. Returns static field sets for the
 * entire response — no per-row evaluation needed.
 */
export async function evaluateExposeDescriptors(
  expose: ExposeEvalConfig,
  ctx: BaseContext,
  options: EnforceAccessOptions = {},
): Promise<EvaluatedExpose> {
  const allowedSelectFields = new Set<string>();
  const nulledFields = new Set<string>();
  const allowedWhereFields = new Set<string>();
  const allowedOrderByFields = new Set<string>();

  // Evaluate select fields
  for (const [field, value] of Object.entries(expose.select)) {
    if (value === true) {
      allowedSelectFields.add(field);
    } else {
      const passed = await evaluateExposeRule(value, ctx, options);
      if (passed) {
        allowedSelectFields.add(field);
      } else {
        // Field exists but user can't see its value — mark for nulling
        allowedSelectFields.add(field);
        nulledFields.add(field);
      }
    }
  }

  // Evaluate allowWhere fields
  if (expose.allowWhere) {
    for (const [field, value] of Object.entries(expose.allowWhere)) {
      if (value === true) {
        allowedWhereFields.add(field);
      } else {
        const passed = await evaluateExposeRule(value, ctx, options);
        if (passed) {
          allowedWhereFields.add(field);
        }
        // If descriptor fails, field is simply not added — "not filterable"
      }
    }
  }

  // Evaluate allowOrderBy fields
  if (expose.allowOrderBy) {
    for (const [field, value] of Object.entries(expose.allowOrderBy)) {
      if (value === true) {
        allowedOrderByFields.add(field);
      } else {
        const passed = await evaluateExposeRule(value, ctx, options);
        if (passed) {
          allowedOrderByFields.add(field);
        }
        // If descriptor fails, field is simply not added — "not sortable"
      }
    }
  }

  return {
    allowedSelectFields,
    nulledFields,
    allowedWhereFields,
    allowedOrderByFields,
  };
}
