/**
 * OAuth Types - Phase 2
 * Types for OAuth providers and OAuth-based authentication
 */

// ============================================================================
// OAuth Configuration
// ============================================================================

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  redirectUri?: string;
}

export interface GoogleOAuthConfig extends OAuthConfig {
  // Google-specific options
  accessType?: 'online' | 'offline';
  prompt?: 'none' | 'consent' | 'select_account';
}

export interface GitHubOAuthConfig extends OAuthConfig {
  // GitHub-specific options
  allowSignUp?: boolean;
}

export interface DiscordOAuthConfig extends OAuthConfig {
  // Discord-specific options
  guildId?: string;
}

// ============================================================================
// OAuth Provider
// ============================================================================

export interface OAuthProvider {
  /** Unique provider identifier */
  id: string;
  /** Display name */
  name: string;
  /** OAuth configuration */
  config: {
    clientId: string;
    clientSecret: string;
    scopes: string[];
    redirectUri?: string;
    // Provider-specific
    authUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
  };
  /** Build authorization URL */
  getAuthorizationUrl(state: string): string;
  /** Exchange code for tokens */
  exchangeCode(code: string): Promise<OAuthTokens>;
  /** Get user info from provider */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

// ============================================================================
// OAuth Tokens
// ============================================================================

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
}

// ============================================================================
// OAuth User Info
// ============================================================================

export interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider: string;
  /** Raw provider data */
  raw?: Record<string, unknown>;
}

// ============================================================================
// OAuth Provider Factory
// ============================================================================

export type OAuthProviderFactory = (config: OAuthConfig) => OAuthProvider;

// ============================================================================
// OAuth Error Types
// ============================================================================

export interface OAuthError {
  code: 
    | 'OAUTH_EXCHANGE_FAILED'
    | 'OAUTH_USER_INFO_FAILED'
    | 'OAUTH_INVALID_STATE'
    | 'OAUTH_ACCESS_DENIED'
    | 'OAUTH_PROVIDER_ERROR';
  message: string;
  status: number;
  provider?: string;
}

// ============================================================================
// Auth Config with OAuth
// ============================================================================

export interface OAuthProviders {
  google?: GoogleOAuthConfig;
  github?: GitHubOAuthConfig;
  discord?: DiscordOAuthConfig;
}

// MFA Configuration - Phase 2
export interface MFAConfig {
  totp?: {
    enabled: boolean;
    issuer?: string;
  };
  backupCodes?: {
    enabled: boolean;
    count?: number;
  };
}

// ============================================================================
// OAuth Result Types
// ============================================================================

export interface AuthResult<T> {
  ok: true;
  data: T;
}

export interface AuthErrorResult {
  ok: false;
  error: OAuthError;
}

export type OAuthAuthResult = AuthResult<{
  user: OAuthUserInfo;
  tokens: OAuthTokens;
}> | AuthErrorResult;

export type OAuthCallbackResult = AuthResult<{
  user: OAuthUserInfo;
  isNewUser: boolean;
}> | AuthErrorResult;
