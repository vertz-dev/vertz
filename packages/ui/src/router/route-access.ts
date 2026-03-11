/**
 * Route access evaluator — walks the matched route chain and evaluates
 * access rules top-down. If any level denies, the whole route is denied.
 *
 * Pure function, no side effects. Used by both SSR handler and client-side router.
 */

import type { RouteAccessRule } from '../auth/route-rules';
import type { MatchedRoute } from './define-routes';

// ---------------------------------------------------------------------------
// Context interface — provided by SSR handler or client-side router
// ---------------------------------------------------------------------------

export interface RouteAccessContext {
  /** Is the user authenticated? */
  authenticated(): boolean;
  /** Does the user have at least one of the specified roles? */
  role(...roles: string[]): boolean;
  /** Does the user have the specified entitlement? */
  can(entitlement: string): boolean;
  /** Seconds since last MFA verification (undefined = not verified) */
  fvaAge: number | undefined;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RouteAccessDenialReason =
  | 'not_authenticated'
  | 'role_denied'
  | 'entitlement_denied'
  | 'fva_required';

export type RouteAccessResult =
  | { allowed: true }
  | { allowed: false; reason: RouteAccessDenialReason };

// ---------------------------------------------------------------------------
// Single rule evaluator
// ---------------------------------------------------------------------------

function evaluateRule(rule: RouteAccessRule, ctx: RouteAccessContext): RouteAccessResult {
  switch (rule.type) {
    case 'public':
      return { allowed: true };

    case 'authenticated':
      return ctx.authenticated()
        ? { allowed: true }
        : { allowed: false, reason: 'not_authenticated' };

    case 'role':
      return ctx.role(...rule.roles)
        ? { allowed: true }
        : { allowed: false, reason: 'role_denied' };

    case 'entitlement':
      return ctx.can(rule.entitlement)
        ? { allowed: true }
        : { allowed: false, reason: 'entitlement_denied' };

    case 'fva':
      return ctx.fvaAge !== undefined && ctx.fvaAge <= rule.maxAge
        ? { allowed: true }
        : { allowed: false, reason: 'fva_required' };

    case 'all': {
      for (const sub of rule.rules) {
        const result = evaluateRule(sub, ctx);
        if (!result.allowed) return result;
      }
      return { allowed: true };
    }

    case 'any': {
      let lastDenial: RouteAccessResult = { allowed: false, reason: 'not_authenticated' };
      for (const sub of rule.rules) {
        const result = evaluateRule(sub, ctx);
        if (result.allowed) return result;
        lastDenial = result;
      }
      return lastDenial;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — evaluate matched route chain
// ---------------------------------------------------------------------------

/**
 * Evaluate access rules for a matched route chain (parent → child).
 * Returns { allowed: true } if all rules pass, or { allowed: false, reason }
 * with the first denial reason.
 *
 * Routes without an access field are treated as public (allowed).
 */
export function evaluateRouteAccess(
  matched: MatchedRoute[],
  ctx: RouteAccessContext,
): RouteAccessResult {
  for (const entry of matched) {
    const rule = entry.route.access;
    if (!rule) continue; // no access = public
    const result = evaluateRule(rule, ctx);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}
