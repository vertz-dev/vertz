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
// --- User profile display helpers ---
export type { AvatarProps } from './avatar';
export { Avatar } from './avatar';
export { createAccessProvider } from './create-access-provider';
// --- OAuth components ---
export type { OAuthButtonProps } from './oauth-button';
export { OAuthButton } from './oauth-button';
export type { OAuthButtonsProps } from './oauth-buttons';
export { OAuthButtons } from './oauth-buttons';
export type { ProtectedRouteProps } from './protected-route';
export { ProtectedRoute } from './protected-route';
export { getProviderIcon } from './provider-icons';
export type { UserAvatarProps } from './user-avatar';
export { UserAvatar } from './user-avatar';
export { getUserDisplayName, getUserInitials } from './user-display';
export { getUserIcon } from './user-icon';
export type { UserNameProps } from './user-name';
export { UserName } from './user-name';
