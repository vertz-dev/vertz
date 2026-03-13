/**
 * @vertz/ui/auth — client-side access control and authentication.
 *
 * Provides AccessContext, can(), AccessGate, createAccessProvider
 * for UI-advisory access checks, and AuthContext, useAuth(), AuthProvider
 * for session management and auth flows.
 */

// --- Access control (existing) ---
export type { AccessContextValue, Entitlement, EntitlementRegistry } from './access-context';
export { AccessContext, can, useAccessContext } from './access-context';
export type {
  AccessEventClient,
  AccessEventClientOptions,
  ClientAccessEvent,
} from './access-event-client';
export { createAccessEventClient } from './access-event-client';
export type { AccessGateProps } from './access-gate';
export { AccessGate } from './access-gate';
export type {
  AccessCheck,
  AccessCheckData,
  AccessSet,
  DenialMeta,
  DenialReason,
} from './access-set-types';
export type { AuthContextValue, AuthProviderProps } from './auth-context';
export { AuthContext, AuthProvider, useAuth } from './auth-context';
export type { AuthGateProps } from './auth-gate';
export { AuthGate } from './auth-gate';
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
export type { ProtectedRouteProps } from './protected-route';
export { ProtectedRoute } from './protected-route';
