/**
 * Auth Module Types - Phase 1
 * JWT sessions, email/password authentication, RBAC
 */
import type { TableEntry } from '@vertz/db';
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
  ttl: string | number;
  refreshable?: boolean;
  cookie?: CookieConfig;
}
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
  window: string;
  maxAttempts: number;
}
export interface AuthConfig {
  session: SessionConfig;
  emailPassword?: EmailPasswordConfig;
  jwtSecret?: string;
  jwtAlgorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256';
  /** Custom claims function for JWT payload */
  claims?: (user: AuthUser) => Record<string, unknown>;
}
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  plan?: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}
export interface SessionPayload {
  sub: string;
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
export interface SignUpInput {
  email: string;
  password: string;
  role?: string;
  [key: string]: unknown;
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
export interface AuthContext {
  headers: Headers;
  request: Request;
  ip?: string;
}
export type AuthResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AuthError;
    };
export interface AuthError {
  code: string;
  message: string;
  status: number;
}
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}
export interface UserTableEntry extends TableEntry<any, any> {
  table: {
    id: {
      type: string;
    };
    email: {
      type: string;
    };
    passwordHash: {
      type: string;
    };
    role: {
      type: string;
    };
    plan?: {
      type: string;
    };
    createdAt: {
      type: Date;
    };
    updatedAt: {
      type: Date;
    };
  };
}
export interface RoleAssignmentTableEntry extends TableEntry<any, any> {
  table: {
    id: {
      type: string;
    };
    userId: {
      type: string;
    };
    role: {
      type: string;
    };
    createdAt: {
      type: Date;
    };
  };
}
//# sourceMappingURL=types.d.ts.map
