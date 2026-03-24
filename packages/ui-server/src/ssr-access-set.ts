/**
 * SSR Access Set Script — serializes access set to window.__VERTZ_ACCESS_SET__.
 *
 * Produces a <script> tag for SSR HTML injection. Escapes all
 * potentially dangerous characters to prevent XSS via JSON injection.
 *
 * If the application uses Content Security Policy with nonce-based
 * script restrictions, pass the request-specific nonce to
 * createAccessSetScript(). Without a nonce, the script works only
 * when inline scripts are allowed by CSP.
 */

import type { AccessSet } from '@vertz/ui/auth';

// ============================================================================
// getAccessSetForSSR()
// ============================================================================

/**
 * The `acl` claim shape embedded in the JWT payload.
 *
 * Canonical type lives in `@vertz/server/auth/types.ts` (AclClaim).
 * Duplicated here because `@vertz/ui-server` cannot depend on `@vertz/server`.
 * If you change this interface, update the counterpart in `types.ts` too.
 */
interface AclClaim {
  set?: {
    entitlements: Record<
      string,
      { allowed: boolean; reasons?: string[]; reason?: string; meta?: Record<string, unknown> }
    >;
    flags: Record<string, boolean>;
    plan: string | null;
    plans?: Record<string, string | null>;
    computedAt: string;
  };
  hash: string;
  overflow: boolean;
}

/**
 * Extract an AccessSet from a decoded JWT payload for SSR injection.
 *
 * - If the JWT has an inline `acl.set` (no overflow), returns the decoded AccessSet.
 * - If `acl.overflow` is true, returns `null` — caller should re-compute from live stores.
 * - If no `acl` claim exists, returns `null`.
 *
 * @param jwtPayload - The decoded JWT payload (from verifyJWT)
 * @returns The AccessSet for SSR injection, or null
 */
export function getAccessSetForSSR(jwtPayload: Record<string, unknown> | null): AccessSet | null {
  if (!jwtPayload) return null;

  const acl = jwtPayload.acl as AclClaim | undefined;
  if (!acl) return null;

  // Overflow — the access set was too large for the JWT.
  // Caller must re-compute from live stores.
  if (acl.overflow) return null;

  // Inline set present
  if (!acl.set) return null;

  return {
    entitlements: Object.fromEntries(
      Object.entries(acl.set.entitlements).map(([name, check]) => [
        name,
        {
          allowed: check.allowed,
          reasons: (check.reasons ?? []) as AccessSet['entitlements'][string]['reasons'],
          ...(check.reason
            ? { reason: check.reason as AccessSet['entitlements'][string]['reason'] }
            : {}),
          ...(check.meta ? { meta: check.meta } : {}),
        },
      ]),
    ),
    flags: acl.set.flags,
    plan: acl.set.plan,
    plans: acl.set.plans ?? {},
    computedAt: acl.set.computedAt,
  };
}

// ============================================================================
// createAccessSetScript()
// ============================================================================

/**
 * Serialize an AccessSet into a `<script>` tag that sets
 * `window.__VERTZ_ACCESS_SET__`.
 *
 * @param accessSet - The access set to serialize
 * @param nonce - Optional CSP nonce for the script tag
 */
export function createAccessSetScript(accessSet: AccessSet, nonce?: string): string {
  const json = JSON.stringify(accessSet);

  // XSS prevention:
  // - Escape all < (covers </script>, <!--, CDATA)
  // - Escape \u2028 and \u2029 (line/paragraph separators that can break JS parsing)
  const escaped = json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const nonceAttr = nonce ? ` nonce="${escapeAttr(nonce)}"` : '';
  return `<script${nonceAttr}>window.__VERTZ_ACCESS_SET__=${escaped}</script>`;
}

// ============================================================================
// Helpers
// ============================================================================

/** Nonce attribute escaping — prevent attribute injection */
function escapeAttr(s: string): string {
  return s.replace(/[&"'<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}
