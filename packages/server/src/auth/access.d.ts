/**
 * Access Control Module - Phase 1
 * RBAC (Role-Based Access Control) with ctx.can() and ctx.authorize()
 */
import type { AuthUser } from './types';
export type Entitlement = string;
export interface RoleDefinition {
  entitlements: Entitlement[];
}
export interface EntitlementDefinition {
  roles: string[];
  /** Optional: Description for documentation */
  description?: string;
}
export interface AccessConfig {
  roles: Record<string, RoleDefinition>;
  entitlements: Record<string, EntitlementDefinition>;
}
export interface AccessInstance {
  /** Check if user has a specific entitlement */
  can(entitlement: Entitlement, user: AuthUser | null): Promise<boolean>;
  /** Check with resource context */
  canWithResource(
    entitlement: Entitlement,
    resource: Resource,
    user: AuthUser | null,
  ): Promise<boolean>;
  /** Throws if not authorized */
  authorize(entitlement: Entitlement, user: AuthUser | null): Promise<void>;
  /** Authorize with resource context */
  authorizeWithResource(
    entitlement: Entitlement,
    resource: Resource,
    user: AuthUser | null,
  ): Promise<void>;
  /** Check multiple entitlements at once */
  canAll(
    checks: Array<{
      entitlement: Entitlement;
      resource?: Resource;
    }>,
    user: AuthUser | null,
  ): Promise<Map<string, boolean>>;
  /** Get all entitlements for a role */
  getEntitlementsForRole(role: string): Entitlement[];
  /** Middleware that adds ctx.can() and ctx.authorize() to context */
  middleware: () => any;
}
export interface Resource {
  id: string;
  type: string;
  ownerId?: string;
  [key: string]: unknown;
}
export declare class AuthorizationError extends Error {
  readonly entitlement: Entitlement;
  readonly userId?: string | undefined;
  constructor(message: string, entitlement: Entitlement, userId?: string | undefined);
}
export declare function createAccess(config: AccessConfig): AccessInstance;
export declare const defaultAccess: AccessInstance;
//# sourceMappingURL=access.d.ts.map
