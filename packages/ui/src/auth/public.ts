/**
 * @vertz/ui/auth — client-side access control and authentication.
 *
 * Provides AccessContext, can(), createAccessProvider for UI-advisory access checks,
 * and AuthContext, useAuth(), AuthProvider for session management and auth flows.
 *
 * UI components (Avatar, AuthGate, ProtectedRoute, etc.) are in @vertz/ui-auth.
 */

// --- Access control (existing) ---
export type {
  AccessContextValue,
  Entitlement,
  EntitlementRegistry,
  RawAccessCheck,
} from './access-context';
export { AccessContext, can, canSignals, useAccessContext } from './access-context';
export type {
  AccessEventClient,
  AccessEventClientOptions,
  ClientAccessEvent,
} from './access-event-client';
export { createAccessEventClient } from './access-event-client';
export type {
  AccessCheck,
  AccessCheckData,
  AccessSet,
  DenialMeta,
  DenialReason,
} from './access-set-types';
export type { AuthContextValue, AuthProviderProps, AuthSdk, AuthSdkMethod } from './auth-context';
export { AuthContext, AuthProvider, useAuth } from './auth-context';
// --- Authentication (new) ---
export type {
  AuthClientError,
  AuthErrorCode,
  AuthResponse,
  AuthStatus,
  ForgotInput,
  MfaInput,
  OAuthProviderInfo,
  ResetInput,
  SignInInput,
  SignOutOptions,
  SignUpInput,
  User,
} from './auth-types';
export { createAccessProvider } from './create-access-provider';
export { getProviderIcon } from './provider-icons';
export type {
  ListTenantsResponse,
  TenantContextValue,
  TenantInfo,
  TenantProviderProps,
} from './tenant-context';
export { TenantContext, TenantProvider, useTenant } from './tenant-context';
export { getUserDisplayName, getUserInitials } from './user-display';
export { getUserIcon } from './user-icon';
