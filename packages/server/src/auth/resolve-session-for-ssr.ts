/**
 * JWT-only session resolver for SSR injection.
 *
 * Reads the session cookie, verifies the JWT signature, and returns
 * minimal session data for client hydration. Does NOT hit the database —
 * this is a hydration hint, not an authorization gate.
 */

import type { AccessCheckData, AccessSet } from './access-set';
import type { CloudJWTVerifier } from './cloud-jwt-verifier';
import { verifyJWT } from './jwt';
import type { AclClaim, SessionPayload } from './types';

export interface ResolveSessionForSSRConfig {
  /** Symmetric secret for HS256 verification (self-hosted mode). */
  jwtSecret?: string;
  /** Algorithm for symmetric verification — defaults to 'HS256'. */
  jwtAlgorithm?: string;
  /** Cloud JWT verifier for RS256 verification (cloud mode). */
  cloudVerifier?: CloudJWTVerifier;
  cookieName: string;
}

export interface SSRSessionResult {
  session: {
    user: { id: string; email: string; role: string; [key: string]: unknown };
    /** Unix timestamp in milliseconds (JWT exp * 1000). */
    expiresAt: number;
  };
  /**
   * Access set from JWT acl claim.
   * - Present (object): inline access set (no overflow)
   * - null: access control is configured but the set overflowed the JWT
   * - undefined: access control is not configured
   */
  accessSet?: AccessSet | null;
}

/**
 * Extract an AccessSet from a decoded JWT acl claim.
 *
 * Mirrors the logic in `@vertz/ui-server/ssr-access-set.ts` (`getAccessSetForSSR`).
 * Duplicated here because `@vertz/server` cannot depend on `@vertz/ui-server`.
 * If you change this function, update the counterpart in `ssr-access-set.ts` too.
 */
function extractAccessSet(acl: AclClaim): AccessSet | null {
  if (acl.overflow) return null;
  if (!acl.set) return null;

  return {
    entitlements: Object.fromEntries(
      Object.entries(acl.set.entitlements).map(([name, check]) => {
        const data: AccessCheckData = {
          allowed: check.allowed,
          reasons: check.reasons ?? [],
          ...(check.reason ? { reason: check.reason } : {}),
          ...(check.meta ? { meta: check.meta } : {}),
        };
        return [name, data];
      }),
    ),
    flags: acl.set.flags,
    plan: acl.set.plan,
    computedAt: acl.set.computedAt,
  };
}

/**
 * Create a session resolver function for SSR injection.
 *
 * The returned function reads the session cookie from a Request,
 * verifies the JWT (signature + expiration only, no DB lookup),
 * and returns session data for `window.__VERTZ_SESSION__` injection.
 */
export function resolveSessionForSSR(
  config: ResolveSessionForSSRConfig,
): (request: Request) => Promise<SSRSessionResult | null> {
  const { jwtSecret, jwtAlgorithm = 'HS256', cloudVerifier, cookieName } = config;

  // Validate: exactly one verification method must be provided
  if (!jwtSecret && !cloudVerifier) {
    throw new Error(
      'resolveSessionForSSR requires either jwtSecret (self-hosted) or cloudVerifier (cloud mode).',
    );
  }
  if (jwtSecret && cloudVerifier) {
    throw new Error('resolveSessionForSSR accepts either jwtSecret or cloudVerifier, not both.');
  }

  return async (request: Request): Promise<SSRSessionResult | null> => {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return null;

    const cookieEntry = cookieHeader.split(';').find((c) => c.trim().startsWith(`${cookieName}=`));
    if (!cookieEntry) return null;

    const token = cookieEntry.trim().slice(`${cookieName}=`.length);
    if (!token) return null;

    // Verify JWT — cloud verifier (RS256) or symmetric (HS256)
    let payload: SessionPayload | null;
    if (cloudVerifier) {
      payload = await cloudVerifier.verify(token);
    } else {
      payload = await verifyJWT(token, jwtSecret!, jwtAlgorithm);
    }
    if (!payload) return null;

    // Allowlist mapping — only known safe fields from JWT payload
    const user: { id: string; email: string; role: string; [key: string]: unknown } = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    if (payload.tenantId) {
      user.tenantId = payload.tenantId;
    }

    const session = {
      user,
      expiresAt: payload.exp * 1000, // seconds -> milliseconds
    };

    // Extract access set from JWT acl claim
    const acl = payload.acl as AclClaim | undefined;

    // Distinguish: undefined = not configured, null = overflow, AccessSet = inline
    const accessSet: AccessSet | null | undefined =
      acl !== undefined ? extractAccessSet(acl) : undefined;

    return { session, accessSet };
  };
}
