/**
 * OAuth Security Module - Phase 2
 * PKCE, state validation, and secure OAuth handling
 */

import { createHash } from 'crypto';

// ============================================================================
// PKCE (Proof Key for Code Exchange)
// ============================================================================

export interface PKCE {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate PKCE code_verifier and code_challenge
 * Per RFC 7636:
 * - code_verifier: 43-128 characters from [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 * - code_challenge: BASE64URL(SHA256(code_verifier))
 */
export function createPKCE(verifier?: string): PKCE {
  let codeVerifier: string;
  
  if (verifier) {
    codeVerifier = verifier;
  } else {
    // Generate cryptographically secure random bytes
    // 32 bytes = 43 characters in base64url
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    codeVerifier = base64UrlEncode(bytes);
  }
  
  // Validate length
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    throw new Error('code_verifier must be 43-128 characters');
  }
  
  // Validate characters (must be base64url safe)
  if (!/^[A-Za-z0-9_-]+$/.test(codeVerifier)) {
    throw new Error('code_verifier must only contain [A-Za-z0-9-_.~]');
  }
  
  // Generate code_challenge using S256 method
  const codeChallenge = base64UrlEncode(
    createHash('sha256').update(codeVerifier).digest()
  );
  
  return { codeVerifier, codeChallenge };
}

/**
 * Generate cryptographically random state parameter
 * 32 bytes = 43 characters in base64url
 */
export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// ============================================================================
// OAuth State Store
// ============================================================================

export interface StateEntry {
  redirectUri: string;
  expiresAt: number;
}

export class OAuthStateStore {
  private store = new Map<string, StateEntry>();
  private ttlMs: number;
  
  constructor(ttlMs: number = 10 * 60 * 1000) { // Default 10 minutes
    this.ttlMs = ttlMs;
  }
  
  /**
   * Store state with redirect URI
   */
  set(state: string, redirectUri: string): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.store.set(state, { redirectUri, expiresAt });
  }
  
  /**
   * Get stored redirect URI for state
   */
  get(state: string): string | null {
    const entry = this.store.get(state);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.store.delete(state);
      return null;
    }
    
    return entry.redirectUri;
  }
  
  /**
   * Validate state and consume it (prevent reuse)
   */
  validate(state: string): boolean {
    const entry = this.store.get(state);
    
    if (!entry) {
      return false;
    }
    
    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.store.delete(state);
      return false;
    }
    
    // Consume the state (delete after validation)
    this.store.delete(state);
    return true;
  }
  
  /**
   * Remove expired states
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [state, entry] of this.store) {
      if (entry.expiresAt < now) {
        this.store.delete(state);
        removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * Get store size
   */
  size(): number {
    return this.store.size;
  }
  
  /**
   * Clear all states
   */
  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// OAuth Error Types
// ============================================================================

export interface OAuthSecurityError {
  code: 
    | 'OAUTH_INVALID_STATE'
    | 'OAUTH_ACCESS_DENIED'
    | 'OAUTH_EXCHANGE_FAILED'
    | 'OAUTH_USER_INFO_FAILED'
    | 'OAUTH_PROVIDER_ERROR'
    | 'OAUTH_PKCE_ERROR';
  message: string;
  status: number;
  provider?: string;
  cause?: Error;
}

export function createOAuthError(
  code: OAuthSecurityError['code'],
  message: string,
  status: number,
  provider?: string,
  cause?: Error
): OAuthSecurityError {
  return { code, message, status, provider, cause };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Base64url encode (no padding)
 */
function base64UrlEncode(buffer: Uint8Array | Buffer): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build secure cookie string for session
 */
export function buildSessionCookie(
  name: string,
  value: string,
  options: {
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
  } = {}
): string {
  const {
    path = '/',
    httpOnly = true,
    secure = true,
    sameSite = 'lax',
    maxAge = 60 * 60 * 24 * 7, // 7 days
  } = options;
  
  let cookie = `${name}=${value}; Path=${path}`;
  
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  cookie += `; SameSite=${sameSite}`;
  cookie += `; Max-Age=${maxAge}`;
  
  return cookie;
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(name: string, path: string = '/'): string {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=lax; Max-Age=0`;
}

// ============================================================================
// OAuth Result Types (Errors as Values)
// ============================================================================

export interface Ok<T> {
  ok: true;
  data: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E = OAuthSecurityError> = Ok<T> | Err<E>;

// Helper constructors
export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err<E = OAuthSecurityError>(error: E): Err<E> {
  return { ok: false, error };
}
