/**
 * Auth Module Types - Phase 2
 * Dual-token sessions, email/password authentication, RBAC
 */

import type { ModelEntry } from '@vertz/db';
import type { AuthError, Result } from '@vertz/errors';
import {
  type Infer,
  type ObjectSchema,
  type OptionalSchema,
  type StringSchema,
  s,
} from '@vertz/schema';
import type { AccessSet } from './access-set';

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
  findActiveSessionById(id: string): Promise<StoredSession | null>;
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
  check(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult>;
  dispose(): void;
}

export interface UserStore {
  createUser(user: AuthUser, passwordHash: string | null): Promise<void>;
  findByEmail(email: string): Promise<{ user: AuthUser; passwordHash: string | null } | null>;
  findById(id: string): Promise<AuthUser | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateEmailVerified(userId: string, verified: boolean): Promise<void>;
  /** Update the last tenant the user switched to. */
  updateLastTenantId(userId: string, tenantId: string): Promise<void>;
  /** Delete a user by id. Used for rollback when onUserCreated fails. */
  deleteUser(id: string): Promise<void>;
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

/** Cloud mode provider config — credentials managed by Vertz Cloud. */
export interface CloudOAuthProviderConfig {
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
  raw: Record<string, unknown>;
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
// Auth-Entity Bridge Types
// ============================================================================

/** Role assignment operations exposed to auth callbacks. */
export interface AuthCallbackRoles {
  assign(userId: string, resourceType: string, resourceId: string, role: string): Promise<void>;
  revoke(userId: string, resourceType: string, resourceId: string, role: string): Promise<void>;
}

/** Context provided to auth lifecycle callbacks. */
export interface AuthCallbackContext {
  /**
   * System-level entity access — bypasses access rules.
   * During sign-up, the user isn't authenticated yet,
   * so access rules like rules.authenticated() would block the callback.
   */
  entities: Record<string, AuthEntityProxy>;
  /**
   * Role assignment operations — available when auth.access is configured.
   * Use to assign roles during user creation (e.g., assign 'member' on a workspace).
   */
  roles: AuthCallbackRoles | undefined;
}

/** Minimal CRUD interface for entity access within auth callbacks. */
export interface AuthEntityProxy {
  get(id: string): Promise<unknown>;
  list(options?: unknown): Promise<unknown>;
  create(data: Record<string, unknown>): Promise<unknown>;
  update(id: string, data: Record<string, unknown>): Promise<unknown>;
  delete(id: string): Promise<void>;
}

/**
 * Discriminated union for onUserCreated callback payload.
 * OAuth and email/password sign-ups provide different data shapes.
 */
export type OnUserCreatedPayload =
  | {
      /** The auth user that was just created. */
      user: AuthUser;
      /** The OAuth provider that created this user. */
      provider: { id: string; name: string };
      /** Full provider API response (cast to GithubProfile, GoogleProfile, etc.). */
      profile: Record<string, unknown>;
    }
  | {
      /** The auth user that was just created. */
      user: AuthUser;
      /** null for email/password sign-up. */
      provider: null;
      /** Extra fields from the sign-up form (via schema passthrough). */
      signUpData: Record<string, unknown>;
    };

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
  /** RSA private key in PKCS#8 PEM format for JWT signing. Required in production. */
  privateKey?: string;
  /** RSA public key in SPKI PEM format for JWT verification. Required in production. */
  publicKey?: string;
  /** Custom claims function for JWT payload */
  claims?: (user: AuthUser) => Record<string, unknown>;
  /**
   * Whether the app runs in production mode.
   * Controls security enforcement (key pair requirement, CSRF validation).
   * Defaults to true when process.env is unavailable (secure-by-default for edge runtimes).
   */
  isProduction?: boolean;
  /**
   * Directory to persist auto-generated dev RSA key pair.
   * Defaults to `.vertz` in the current working directory.
   * Only used in non-production mode when keys are not provided.
   */
  devKeyPath?: string;
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
  /** Tenant switching configuration — enables POST /auth/switch-tenant.
   *  Set to `false` to explicitly disable auto-wired tenant (when auth.access + .tenant() table). */
  tenant?: TenantConfig | false;
  /**
   * Called after a new user is created in the auth system.
   * Fires before the session is created.
   * If this throws, the auth user is rolled back (deleted).
   */
  onUserCreated?: (payload: OnUserCreatedPayload, ctx: AuthCallbackContext) => Promise<void>;
  /** @internal Entity proxy for onUserCreated callback. Set by createServer(). */
  _entityProxy?: Record<string, AuthEntityProxy>;
}

/** Tenant info returned by listTenants callback. */
export interface TenantInfo {
  id: string;
  name: string;
  [key: string]: unknown;
}

/** Configuration for multi-tenant session switching. */
export interface TenantConfig {
  /** Verify that user has membership in the target tenant. Return false to deny. */
  verifyMembership: (userId: string, tenantId: string) => Promise<boolean>;
  /** List tenants the user belongs to. Enables GET /api/auth/tenants endpoint. */
  listTenants?: (userId: string) => Promise<TenantInfo[]>;
  /** Resolve which tenant to auto-switch to when session has no tenantId. Falls back to lastTenantId > first tenant. */
  resolveDefault?: (userId: string, tenants: TenantInfo[]) => Promise<string | undefined>;
}

/** Access control configuration for JWT acl claim computation.
 *  When used with `createServer()` and a DatabaseClient, `roleStore` and
 *  `closureStore` are auto-wired from the DB and don't need to be provided. */
export interface AuthAccessConfig {
  definition: import('./define-access').AccessDefinition;
  /** Role assignment store — auto-wired from DB by `createServer()` when omitted. */
  roleStore?: import('./role-assignment-store').RoleAssignmentStore;
  /** Closure store for hierarchy — auto-wired from DB by `createServer()` when omitted. */
  closureStore?: import('./closure-store').ClosureStore;
  flagStore?: import('./flag-store').FlagStore;
  subscriptionStore?: import('./subscription-store').SubscriptionStore;
  walletStore?: import('./wallet-store').WalletStore;
}

// ============================================================================
// User & Session Types
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  lastTenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: string;
  iat: number;
  exp: number;
  jti: string; // JWT ID — unique token identifier
  sid: string; // Session ID — links JWT to session record
  tenantId?: string; // Current tenant scope — set via switch-tenant
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

type ReservedSignUpField = 'role' | 'emailVerified' | 'id' | 'createdAt' | 'updatedAt';

type ReservedSignUpFields = {
  [K in ReservedSignUpField]?: never;
};

const authEmailFieldSchema: StringSchema = s.string().min(1).trim();
const authPasswordFieldSchema: StringSchema = s.string().min(1);

export const signUpInputSchema: ObjectSchema<{
  email: StringSchema;
  password: StringSchema;
}> = s
  .object({
    email: authEmailFieldSchema,
    password: authPasswordFieldSchema,
  })
  .passthrough();

export const signInInputSchema: ObjectSchema<{
  email: StringSchema;
  password: StringSchema;
}> = s.object({
  email: authEmailFieldSchema,
  password: authPasswordFieldSchema,
});

export const codeInputSchema: ObjectSchema<{
  code: StringSchema;
}> = s.object({
  code: s.string().min(1),
});

export const passwordInputSchema: ObjectSchema<{
  password: StringSchema;
}> = s.object({
  password: s.string().min(1),
});

export const tokenInputSchema: ObjectSchema<{
  token: OptionalSchema<string, string>;
}> = s.object({
  token: s.string().min(1).optional(),
});

export const forgotPasswordInputSchema: ObjectSchema<{
  email: StringSchema;
}> = s.object({
  email: s.string().min(1).trim(),
});

export const resetPasswordInputSchema: ObjectSchema<{
  token: OptionalSchema<string, string>;
  password: StringSchema;
}> = s.object({
  token: s.string().min(1).optional(),
  password: s.string().min(1),
});

export const switchTenantInputSchema: ObjectSchema<{
  tenantId: StringSchema;
}> = s.object({
  tenantId: s.string().min(1),
});

export type SwitchTenantInput = Infer<typeof switchTenantInputSchema>;

export type SignUpInput = Infer<typeof signUpInputSchema> &
  ReservedSignUpFields &
  Record<string, unknown>;

export type SignInInput = Infer<typeof signInInputSchema>;
export type CodeInput = Infer<typeof codeInputSchema>;
export type PasswordInput = Infer<typeof passwordInputSchema>;
export type TokenInput = Infer<typeof tokenInputSchema>;
export type ForgotPasswordInput = Infer<typeof forgotPasswordInputSchema>;
export type ResetPasswordInput = Infer<typeof resetPasswordInputSchema>;

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
  /**
   * JWT-only session resolver for SSR injection.
   * Reads the session cookie, verifies JWT (no DB lookup), and returns
   * minimal session data + optional access set for client hydration.
   */
  resolveSessionForSSR: (request: Request) => Promise<{
    session: {
      user: { id: string; email: string; role: string; [key: string]: unknown };
      expiresAt: number;
    };
    accessSet?: AccessSet | null;
  } | null>;
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
