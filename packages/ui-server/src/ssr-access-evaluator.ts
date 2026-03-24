/**
 * SSR prefetch access rule evaluator.
 *
 * Evaluates serialized entity access rules against the current session
 * to determine whether a query should be prefetched during SSR.
 *
 * The serialized rules come from the prefetch manifest (generated at build time).
 * The session comes from the JWT decoded at request time.
 */

// ─── Types ──────────────────────────────────────────────────────

/**
 * Serialized access rule — the JSON-friendly format stored in the manifest.
 * Mirrors SerializedRule from @vertz/server/auth/rules but defined here
 * to avoid importing the server package into the SSR pipeline.
 */
export type SerializedAccessRule =
  | { type: 'public' }
  | { type: 'authenticated' }
  | { type: 'role'; roles: string[] }
  | { type: 'entitlement'; value: string }
  | { type: 'where'; conditions: Record<string, unknown> }
  | { type: 'all'; rules: SerializedAccessRule[] }
  | { type: 'any'; rules: SerializedAccessRule[] }
  | { type: 'fva'; maxAge: number }
  | { type: 'deny' };

/**
 * Minimal session shape needed for prefetch access evaluation.
 * Extracted from the JWT at SSR request time.
 */
export type PrefetchSession =
  | {
      status: 'authenticated';
      roles?: string[];
      entitlements?: Record<string, boolean>;
      tenantId?: string;
    }
  | { status: 'unauthenticated' };

// ─── Session conversion ─────────────────────────────────────────

/**
 * Minimal shape of an AccessSet for entitlement extraction.
 * Avoids importing @vertz/server types into the SSR pipeline.
 */
interface AccessSetLike {
  entitlements: Record<string, { allowed: boolean }>;
}

/**
 * Convert SSRAuth (from the JWT/session resolver) to PrefetchSession
 * for entity access evaluation during SSR prefetching.
 *
 * @param ssrAuth - Auth state from session resolver
 * @param accessSet - Access set from JWT acl claim (null = overflow, undefined = not configured)
 */
export function toPrefetchSession(
  ssrAuth: { status: string; user?: { role?: string; [key: string]: unknown } } | undefined,
  accessSet?: AccessSetLike | null,
): PrefetchSession {
  if (!ssrAuth || ssrAuth.status !== 'authenticated' || !ssrAuth.user) {
    return { status: 'unauthenticated' };
  }
  const roles = ssrAuth.user.role ? [ssrAuth.user.role as string] : undefined;
  const entitlements =
    accessSet != null
      ? Object.fromEntries(
          Object.entries(accessSet.entitlements).map(([name, check]) => [name, check.allowed]),
        )
      : undefined;
  return {
    status: 'authenticated',
    roles,
    entitlements,
    tenantId: ssrAuth.user.tenantId as string | undefined,
  };
}

// ─── Evaluator ──────────────────────────────────────────────────

/**
 * Evaluate a serialized access rule against the current session.
 *
 * Returns true if the query is eligible for prefetch (the user
 * likely has access), false if it should be skipped.
 *
 * Design rationale for specific rule types:
 * - `where` → true: row-level filter, not an access gate. The query
 *   always executes; it just returns fewer rows for non-owners.
 * - `fva` → optimistic for authenticated users: MFA freshness is
 *   enforced on the actual API call. If the check fails server-side,
 *   the query returns an error result.
 * - `deny` → false: explicitly denied operations are never prefetched.
 * - Unknown types → false: fail-secure. Don't prefetch if we can't
 *   evaluate the rule.
 */
export function evaluateAccessRule(rule: SerializedAccessRule, session: PrefetchSession): boolean {
  switch (rule.type) {
    case 'public':
      return true;

    case 'authenticated':
      return session.status === 'authenticated';

    case 'role':
      if (session.status !== 'authenticated') return false;
      return session.roles?.some((r) => rule.roles.includes(r)) === true;

    case 'entitlement':
      if (session.status !== 'authenticated') return false;
      return session.entitlements?.[rule.value] === true;

    case 'where':
      // Row-level filter — applied at DB level, not an access gate.
      return true;

    case 'fva':
      // MFA freshness — optimistic for authenticated users.
      return session.status === 'authenticated';

    case 'deny':
      return false;

    case 'all':
      return rule.rules.every((r) => evaluateAccessRule(r, session));

    case 'any':
      return rule.rules.some((r) => evaluateAccessRule(r, session));

    default:
      // Unknown rule type → fail-secure
      return false;
  }
}
