/**
 * OAuth Provider Implementations - Phase 2
 * Google, GitHub, Discord providers
 */

import type {
  OAuthProvider,
  OAuthConfig,
  OAuthTokens,
  OAuthUserInfo,
  GoogleOAuthConfig,
  GitHubOAuthConfig,
  DiscordOAuthConfig,
} from './types';

// ============================================================================
// Base Provider Factory
// ============================================================================

export interface ProviderOptions {
  id: string;
  name: string;
  config: {
    clientId: string;
    clientSecret: string;
    scopes: string[];
    redirectUri?: string;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
  };
  transformUserInfo: (data: Record<string, unknown>, provider: string) => OAuthUserInfo;
}

export function createOAuthProvider(options: ProviderOptions): OAuthProvider {
  const { id, name, config, transformUserInfo } = options;
  const scopes = config.scopes || [];

  function buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri || getDefaultRedirectUri(id),
      response_type: 'code',
      scope: scopes.join(' '),
      state,
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async function exchangeCode(_code: string): Promise<OAuthTokens> {
    // In production, this would make an HTTP request
    // For now, we throw to indicate this needs to be implemented with actual HTTP client
    throw new Error('OAuth token exchange requires HTTP client. Use provider-specific implementation.');
  }

  async function getUserInfo(_accessToken: string): Promise<OAuthUserInfo> {
    // In production, this would make an HTTP request
    throw new Error('OAuth user info requires HTTP client. Use provider-specific implementation.');
  }

  return {
    id,
    name,
    config,
    getAuthorizationUrl: buildAuthorizationUrl,
    exchangeCode,
    getUserInfo,
  };
}

function getDefaultRedirectUri(provider: string): string {
  // In production, this would come from config or environment
  return `/api/auth/oauth/${provider}/callback`;
}

// ============================================================================
// Google Provider
// ============================================================================

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function google(config: GoogleOAuthConfig): OAuthProvider {
  const scopes = config.scopes || ['openid', 'email', 'profile'];

  return {
    id: 'google',
    name: 'Google',
    config: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes,
      redirectUri: config.redirectUri,
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      userInfoUrl: GOOGLE_USERINFO_URL,
    },
    getAuthorizationUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri || getDefaultRedirectUri('google'),
        response_type: 'code',
        scope: scopes.join(' '),
        state,
        access_type: config.accessType || 'online',
        prompt: config.prompt || 'consent',
      });

      return `${GOOGLE_AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code: string): Promise<OAuthTokens> {
      // This would use fetch in real implementation
      // For now, return mock structure
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri || getDefaultRedirectUri('google'),
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        throw new Error(`Google token exchange failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      };
    },
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      const response = await fetch(`${GOOGLE_USERINFO_URL}?alt=json`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Google user info failed: ${response.status}`);
      }

      const data = await response.json();
      return transformGoogleUserInfo(data);
    },
  };
}

function transformGoogleUserInfo(data: Record<string, unknown>): OAuthUserInfo {
  return {
    id: data.sub as string,
    email: data.email as string,
    name: data.name as string | undefined,
    avatar: data.picture as string | undefined,
    provider: 'google',
    raw: data,
  };
}

// ============================================================================
// GitHub Provider
// ============================================================================

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USERINFO_URL = 'https://api.github.com/user';

export function github(config: GitHubOAuthConfig): OAuthProvider {
  const scopes = config.scopes || ['read:user', 'user:email'];

  return {
    id: 'github',
    name: 'GitHub',
    config: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes,
      redirectUri: config.redirectUri,
      authUrl: GITHUB_AUTH_URL,
      tokenUrl: GITHUB_TOKEN_URL,
      userInfoUrl: GITHUB_USERINFO_URL,
    },
    getAuthorizationUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri || getDefaultRedirectUri('github'),
        scope: scopes.join(' '),
        state,
        ...(config.allowSignUp !== undefined && { allow_signup: config.allowSignUp.toString() }),
      });

      return `${GITHUB_AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code: string): Promise<OAuthTokens> {
      const response = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri || getDefaultRedirectUri('github'),
        }),
      });

      if (!response.ok) {
        throw new Error(`GitHub token exchange failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: undefined,
        expiresIn: undefined,
        tokenType: data.token_type,
        scope: data.scope,
      };
    },
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      // Get user info
      const userResponse = await fetch(GITHUB_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub user info failed: ${userResponse.status}`);
      }

      const userData = await userResponse.json();

      // Get email (if not public)
      let email = userData.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          const primary = emails.find((e: any) => e.primary);
          email = primary?.email;
        }
      }

      return transformGitHubUserInfo(userData, email);
    },
  };
}

function transformGitHubUserInfo(data: Record<string, unknown>, email?: string): OAuthUserInfo {
  const avatar = data.avatar_url as string | undefined;
  
  return {
    id: String(data.id),
    email: email || '',
    name: data.name as string | undefined,
    avatar,
    provider: 'github',
    raw: data,
  };
}

// ============================================================================
// Discord Provider
// ============================================================================

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USERINFO_URL = 'https://discord.com/api/users/@me';

export function discord(config: DiscordOAuthConfig): OAuthProvider {
  const scopes = config.scopes || ['identify', 'email'];

  return {
    id: 'discord',
    name: 'Discord',
    config: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes,
      redirectUri: config.redirectUri,
      authUrl: DISCORD_AUTH_URL,
      tokenUrl: DISCORD_TOKEN_URL,
      userInfoUrl: DISCORD_USERINFO_URL,
    },
    getAuthorizationUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri || getDefaultRedirectUri('discord'),
        response_type: 'code',
        scope: scopes.join(' '),
        state,
        ...(config.guildId && { guild_id: config.guildId }),
        permissions: '0',
      });

      return `${DISCORD_AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code: string): Promise<OAuthTokens> {
      const response = await fetch(DISCORD_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri || getDefaultRedirectUri('discord'),
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        throw new Error(`Discord token exchange failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      };
    },
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
      const response = await fetch(DISCORD_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Discord user info failed: ${response.status}`);
      }

      const data = await response.json();
      return transformDiscordUserInfo(data);
    },
  };
}

function transformDiscordUserInfo(data: Record<string, unknown>): OAuthUserInfo {
  const id = data.id as string;
  const avatar = data.avatar 
    ? `https://cdn.discordapp.com/avatars/${id}/${data.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${Number(data.discriminator) % 5}.png`;

  return {
    id,
    email: data.email as string || '',
    name: `${data.username}#${data.discriminator}`,
    avatar,
    provider: 'discord',
    raw: data,
  };
}

// ============================================================================
// Provider Registry
// ============================================================================

export function getProviderById(providers: OAuthProvider[], id: string): OAuthProvider | undefined {
  return providers.find(p => p.id === id);
}

export function validateProviderConfig(config: OAuthConfig): { valid: boolean; error?: string } {
  if (!config.clientId) {
    return { valid: false, error: 'clientId is required' };
  }
  if (!config.clientSecret) {
    return { valid: false, error: 'clientSecret is required' };
  }
  return { valid: true };
}
