/**
 * Auth Module Types - Phase 1 & 2
 * JWT sessions, email/password authentication, RBAC, OAuth, MFA
 */

import type { TableEntry } from '@vertz/db';
import type { OAuthProvider, MFAConfig as OAuthMFAConfig } from './oauth/types';

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
  ttl: string | number; // Duration like '7d' or milliseconds
  refreshable?: boolean;
  cookie?: CookieConfig;
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
// Auth Configuration
// ============================================================================

export interface AuthConfig {
  session: SessionConfig;
  emailPassword?: EmailPasswordConfig;
  jwtSecret?: string; // For JWT signing - required for JWT strategy
  jwtAlgorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256';
  /** Custom claims function for JWT payload */
  claims?: (user: AuthUser) => Record<string, unknown>;
  /** OAuth providers - Phase 2 */
  providers?: OAuthProvider[];
  /** MFA configuration - Phase 2 */
  mfa?: OAuthMFAConfig;
}

// Re-export MFA config for convenience
export type MFAConfig = OAuthMFAConfig;

// ============================================================================
// User & Session Types
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  plan?: string;
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
  claims?: Record<string, unknown>;
}

export interface Session {
  user: AuthUser;
  expiresAt: Date;
  payload: SessionPayload;
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
  signUp: (data: SignUpInput) => Promise<AuthResult<Session>>;
  signIn: (data: SignInInput) => Promise<AuthResult<Session>>;
  signOut: (ctx: AuthContext) => Promise<AuthResult<void>>;
  getSession: (headers: Headers) => Promise<AuthResult<Session | null>>;
  refreshSession: (ctx: AuthContext) => Promise<AuthResult<Session>>;
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
  middleware: () => any;
  /** Initialize auth (create tables, etc.) */
  initialize: () => Promise<void>;
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
// Result Type
// ============================================================================

export type AuthResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: AuthError };

export interface AuthError {
  code: string;
  message: string;
  status: number;
}

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
export interface UserTableEntry extends TableEntry<any, any> {
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
export interface RoleAssignmentTableEntry extends TableEntry<any, any> {
  table: {
    id: { type: string };
    userId: { type: string };
    role: { type: string };
    createdAt: { type: Date };
  };
}
