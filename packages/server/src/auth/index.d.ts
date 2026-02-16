/**
 * Auth Module Implementation - Phase 1
 * JWT sessions, email/password authentication
 */
import type { AuthConfig, AuthInstance, AuthError, PasswordRequirements } from './types';
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
export declare function validatePassword(
  password: string,
  requirements?: PasswordRequirements,
): AuthError | null;
export declare function createAuth(config: AuthConfig): AuthInstance;
export { createAccess, defaultAccess, AuthorizationError } from './access';
export type {
  AccessConfig,
  AccessInstance,
  Entitlement,
  EntitlementDefinition,
  Resource,
} from './access';
export type {
  AuthConfig,
  AuthInstance,
  AuthApi,
  AuthResult,
  AuthError,
  AuthUser,
  AuthContext,
  Session,
  SessionPayload,
  SessionStrategy,
  SessionConfig,
  CookieConfig,
  EmailPasswordConfig,
  PasswordRequirements,
  RateLimitConfig,
  RateLimitResult,
  SignUpInput,
  SignInInput,
  UserTableEntry,
  RoleAssignmentTableEntry,
} from './types';
//# sourceMappingURL=index.d.ts.map
