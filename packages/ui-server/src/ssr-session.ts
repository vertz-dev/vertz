/**
 * SSR Session Script — serializes auth session to window.__VERTZ_SESSION__.
 *
 * Produces a <script> tag for SSR HTML injection. Escapes all
 * potentially dangerous characters to prevent XSS via JSON injection.
 *
 * If the application uses Content Security Policy with nonce-based
 * script restrictions, pass the request-specific nonce to
 * createSessionScript(). Without a nonce, the script works only
 * when inline scripts are allowed by CSP.
 */

import type { AccessSet } from '@vertz/ui/auth';

export interface SessionData {
  user: { id: string; email: string; role: string; [key: string]: unknown };
  /** Unix timestamp in milliseconds (JWT exp * 1000). */
  expiresAt: number;
}

/** Resolved session data for SSR injection. */
export interface SSRSessionInfo {
  session: SessionData;
  /**
   * Access set from JWT acl claim.
   * - Present (object): inline access set (no overflow)
   * - null: access control is configured but the set overflowed the JWT
   * - undefined: access control is not configured
   */
  accessSet?: AccessSet | null;
}

/**
 * Callback that extracts session data from a request.
 * Returns null when no valid session exists (expired, missing, or invalid cookie).
 */
export type SessionResolver = (request: Request) => Promise<SSRSessionInfo | null>;

/**
 * Serialize a session into a `<script>` tag that sets
 * `window.__VERTZ_SESSION__`.
 *
 * @param session - The session data to serialize
 * @param nonce - Optional CSP nonce for the script tag
 */
export function createSessionScript(session: SessionData, nonce?: string): string {
  const json = JSON.stringify(session);

  // XSS prevention:
  // - Escape all < (covers </script>, <!--, CDATA)
  // - Escape \u2028 and \u2029 (line/paragraph separators that can break JS parsing)
  const escaped = json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const nonceAttr = nonce ? ` nonce="${escapeAttr(nonce)}"` : '';
  return `<script${nonceAttr}>window.__VERTZ_SESSION__=${escaped}</script>`;
}

/** Nonce attribute escaping — prevent attribute injection */
function escapeAttr(s: string): string {
  return s.replace(/[&"'<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}
