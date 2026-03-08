/**
 * Auth Module Types - Phase 2
 * Dual-token sessions, email/password authentication, RBAC
 */

import type { ModelEntry } from '@vertz/db';
import type { AuthError, Result } from '@vertz/errors';

// ============================================================================
// Session Types
// ============================================================================

export type SessionStrategy = 'jwt' | 'database' | 'hybrid';

export interface CookieConfig {
  name?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  maxAge?: number;
}

export interface SessionConfig {
  strategy: SessionStrategy;
  ttl: string | number; // Duration like '60s' or milliseconds
  refreshTtl?: string | number; // Duration like '7d' — defaults to '7d'
  refreshable?: boolean;
  cookie?: CookieConfig;
  refreshName?: string; // Cookie name for refresh token — defaults to 'vertz.ref'
}

// ============================================================================
// Email/Password Types
// ============================================================================

export interface PasswordRequirements {
  minLength?: number;
  requireUppercase?: boolean;
  requireNumbers?: boolean;
  requireSymbols?: boolean;
}

export interface EmailPasswordConfig {
  enabled?: boolean;
  password?: PasswordRequirements;
  rateLimit?: RateLimitConfig;
}

export interface RateLimitConfig {
  window: string; // e.g., '15m', '1h'
  maxAttempts: number;
}

// ============================================================================
// Store Interfaces
// ============================================================================

export interface SessionStore {
  createSessionWithId(
    id: string,
    data: {
      userId: string;
      refreshTokenHash: string;
      ipAddress: string;
      userAgent: string;
      expiresAt: Date;
      currentTokens?: AuthTokens;
    },
  ): Promise<StoredSession>;
  findByRefreshHash(hash: string): Promise<StoredSession | null>;
  findByPreviousRefreshHash(hash: string): Promise<StoredSession | null>;
  revokeSession(id: string): Promise<void>;
  listActiveSessions(userId: string): Promise<StoredSession[]>;
  countActiveSessions(userId: string): Promise<number>;
  getCurrentTokens(sessionId: string): Promise<AuthTokens | null>;
  updateSession(
    id: string,
    data: {
      refreshTokenHash: string;
      previousRefreshHash: string;
      lastActiveAt: Date;
      currentTokens?: AuthTokens;
    },
  ): Promise<void>;
  dispose(): void;
}

export interface StoredSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshHash: string | null;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RateLimitStore {
  check(key: string, maxAttempts: number, windowMs: number): RateLimitResult;
  dispose(): void;
}

export interface UserStore {
  createUser(user: AuthUser, passwordHash: string | null): Promise<void>;
  findByEmail(email: string): Promise<{ user: AuthUser; passwordHash: string | null } | null>;
  findById(id: string): Promise<AuthUser | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateEmailVerified(userId: string, verified: boolean): Promise<void>;
}

// ============================================================================
// MFA Types
// ============================================================================

export interface MfaConfig {
  enabled?: boolean;
  issuer?: string;
  backupCodeCount?: number;
}

export interface MFAStore {
  enableMfa(userId: string, encryptedSecret: string): Promise<void>;
  disableMfa(userId: string): Promise<void>;
  getSecret(userId: string): Promise<string | null>;
  isMfaEnabled(userId: string): Promise<boolean>;
  setBackupCodes(userId: string, hashedCodes: string[]): Promise<void>;
  getBackupCodes(userId: string): Promise<string[]>;
  consumeBackupCode(userId: string, hashedCode: string): Promise<void>;
  dispose(): void;
}

export interface MfaSetupData {
  secret: string;
  uri: string;
}

export interface MfaChallengeData {
  userId: string;
  sessionId?: string;
  expiresAt: number;
}

// ============================================================================
// OAuth Types
// ============================================================================

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUrl?: string;
  scopes?: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;
}

export interface OAuthUserInfo {
  providerId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  scopes: string[];
  trustEmail: boolean;
  getAuthorizationUrl: (state: string, codeChallenge?: string, nonce?: string) => string;
  exchangeCode: (code: string, codeVerifier?: string) => Promise<OAuthTokens>;
  getUserInfo: (accessToken: string, idToken?: string, nonce?: string) => Promise<OAuthUserInfo>;
}

export interface OAuthAccountStore {
  linkAccount(userId: string, provider: string, providerId: string, email?: string): Promise<void>;
  findByProviderAccount(provider: string, providerId: string): Promise<string | null>;
  findByUserId(userId: string): Promise<{ provider: string; providerId: string }[]>;
  unlinkAccount(userId: string, provider: string): Promise<void>;
  dispose(): void;
}

export interface OAuthStateData {
  provider: string;
  state: string;
  codeVerifier: string;
  nonce?: string;
  expiresAt: number;
}

// ============================================================================
// Email Verification Types
// ============================================================================

export interface EmailVerificationConfig {
  enabled: boolean;
  tokenTtl?: string | number; // Duration like '24h' — defaults to '24h'
  onSend: (user: AuthUser, token: string) => Promise<void>;
}

export interface StoredEmailVerification {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface EmailVerificationStore {
  createVerification(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StoredEmailVerification>;
  findByTokenHash(tokenHash: string): Promise<StoredEmailVerification | null>;
  deleteByUserId(userId: string): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  dispose(): void;
}

// ============================================================================
// Password Reset Types
// ============================================================================

export interface PasswordResetConfig {
  enabled: boolean;
  tokenTtl?: string | number; // Duration like '1h' — defaults to '1h'
  revokeSessionsOnReset?: boolean; // Default: true
  onSend: (user: AuthUser, token: string) => Promise<void>;
}

export interface StoredPasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface PasswordResetStore {
  createReset(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StoredPasswordReset>;
  findByTokenHash(tokenHash: string): Promise<StoredPasswordReset | null>;
  deleteByUserId(userId: string): Promise<void>;
  dispose(): void;
}

// ============================================================================
// Auth Configuration
// ============================================================================

export interface AuthConfig {
  session: SessionConfig;
  emailPassword?: EmailPasswordConfig;
  jwtSecret?: string; // For JWT signing - required for JWT strategy
  jwtAlgorithm?: 'HS256' | 'HS384' | 'HS512';
  /** Custom claims function for JWT payload */
  claims?: (user: AuthUser) => Record<string, unknown>;
  /**
   * Whether the app runs in production mode.
   * Controls security enforcement (JWT secret requirement, CSRF validation).
   * Defaults to true when process.env is unavailable (secure-by-default for edge runtimes).
   */
  isProduction?: boolean;
  /**
   * Directory to persist auto-generated dev JWT secret.
   * Defaults to `.vertz` in the current working directory.
   * Only used in non-production mode when jwtSecret is not provided.
   */
  devSecretPath?: string;
  /** Pluggable session store — defaults to InMemorySessionStore */
  sessionStore?: SessionStore;
  /** Pluggable rate limit store — defaults to InMemoryRateLimitStore */
  rateLimitStore?: RateLimitStore;
  /** Pluggable user store — defaults to InMemoryUserStore */
  userStore?: UserStore;
  /** OAuth provider instances */
  providers?: OAuthProvider[];
  /** Pluggable OAuth account store — required when providers are configured */
  oauthAccountStore?: OAuthAccountStore;
  /** Encryption key for OAuth state cookies — required when providers are configured */
  oauthEncryptionKey?: string;
  /** Redirect URL after successful OAuth (default '/') */
  oauthSuccessRedirect?: string;
  /** Redirect URL on OAuth error (default '/auth/error') */
  oauthErrorRedirect?: string;
  /** MFA configuration */
  mfa?: MfaConfig;
  /** Pluggable MFA store — defaults to InMemoryMFAStore */
  mfaStore?: MFAStore;
  /** Email verification configuration */
  emailVerification?: EmailVerificationConfig;
  /** Pluggable email verification store — defaults to InMemoryEmailVerificationStore */
  emailVerificationStore?: EmailVerificationStore;
  /** Password reset configuration */
  passwordReset?: PasswordResetConfig;
  /** Pluggable password reset store — defaults to InMemoryPasswordResetStore */
  passwordResetStore?: PasswordResetStore;
  /** Access control configuration — enables ACL claim in JWT */
  access?: AuthAccessConfig;
}

/** Access control configuration for JWT acl claim computation. */
export interface AuthAccessConfig {
  definition: import('./define-access').AccessDefinition;
  roleStore: import('./role-assignment-store').RoleAssignmentStore;
  closureStore: import('./closure-store').ClosureStore;
}

// ============================================================================
// User & Session Types
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  plan?: string;
  emailVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Additional fields from user's table
  [key: string]: unknown;
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: string;
  iat: number;
  exp: number;
  jti: string; // JWT ID — unique token identifier
  sid: string; // Session ID — links JWT to session record
  claims?: Record<string, unknown>;
  fva?: number; // Factor verification age — timestamp of last MFA verification
  acl?: AclClaim; // Access set claim — computed entitlements
}

/** JWT acl claim — embedded access set with overflow strategy. */
export interface AclClaim {
  /** Full sparse set when fits within 2KB budget */
  set?: import('./access-set').EncodedAccessSet;
  /** SHA-256 hex of canonical JSON — always present */
  hash: string;
  /** True when set omitted due to size */
  overflow: boolean;
}

export interface AuthTokens {
  jwt: string;
  refreshToken: string;
}

export interface Session {
  user: AuthUser;
  expiresAt: Date;
  payload: SessionPayload;
  tokens?: AuthTokens;
}

export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  deviceName: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

// ============================================================================
// Auth API Types
// ============================================================================

export interface SignUpInput {
  email: string;
  password: string;
  role?: string; // Default role, defaults to 'user'
  [key: string]: unknown; // Additional fields
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthApi {
  signUp: (data: SignUpInput, ctx?: { headers: Headers }) => Promise<Result<Session, AuthError>>;
  signIn: (data: SignInInput, ctx?: { headers: Headers }) => Promise<Result<Session, AuthError>>;
  signOut: (ctx: { headers: Headers }) => Promise<Result<void, AuthError>>;
  getSession: (headers: Headers) => Promise<Result<Session | null, AuthError>>;
  refreshSession: (ctx: { headers: Headers }) => Promise<Result<Session, AuthError>>;
  listSessions: (headers: Headers) => Promise<Result<SessionInfo[], AuthError>>;
  revokeSession: (sessionId: string, headers: Headers) => Promise<Result<void, AuthError>>;
  revokeAllSessions: (headers: Headers) => Promise<Result<void, AuthError>>;
}

// ============================================================================
// Auth Instance
// ============================================================================

export interface AuthInstance {
  /** HTTP handler for auth routes */
  handler: (request: Request) => Promise<Response>;
  /** Server-side API */
  api: AuthApi;
  /** Session middleware that injects ctx.user */
  middleware: () => (ctx: Record<string, unknown>, next: () => Promise<void>) => Promise<void>;
  /** Initialize auth (create tables, etc.) */
  initialize: () => Promise<void>;
  /** Dispose stores and cleanup intervals */
  dispose: () => void;
}

// ============================================================================
// Auth Context (for handlers)
// ============================================================================

export interface AuthContext {
  headers: Headers;
  request: Request;
  ip?: string;
}

// ============================================================================
// Result Type (re-exported from @vertz/errors)
// ============================================================================

// AuthResult is now Result<T, AuthError> from @vertz/errors
// AuthError is now the union type from @vertz/errors

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// ============================================================================
// Table Types (for schema integration)
// ============================================================================

// Users table entry type (will be provided by user)
export interface UserTableEntry extends ModelEntry<any, any> {
  table: {
    id: { type: string };
    email: { type: string };
    passwordHash: { type: string };
    role: { type: string };
    plan?: { type: string };
    createdAt: { type: Date };
    updatedAt: { type: Date };
  };
}

// Role assignments table
export interface RoleAssignmentTableEntry extends ModelEntry<any, any> {
  table: {
    id: { type: string };
    userId: { type: string };
    role: { type: string };
    createdAt: { type: Date };
  };
}
