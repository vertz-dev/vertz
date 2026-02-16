/**
 * OAuth Provider Tests - Phase 2
 * Tests for OAuth provider factories (Google, GitHub, Discord)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  google,
  github,
  discord,
  createOAuthProvider,
} from '../../auth/oauth/providers';
import type { OAuthProvider, OAuthConfig } from '../../auth/oauth/types';

describe('OAuth Providers', () => {
  describe('google', () => {
    let provider: OAuthProvider;
    const config: OAuthConfig = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    };

    beforeEach(() => {
      provider = google(config);
    });

    it('should create a Google provider', () => {
      expect(provider).toBeDefined();
      expect(provider.id).toBe('google');
      expect(provider.name).toBe('Google');
    });

    it('should have correct default scopes', () => {
      expect(provider.config.scopes).toContain('openid');
      expect(provider.config.scopes).toContain('email');
      expect(provider.config.scopes).toContain('profile');
    });

    it('should generate valid authorization URL', () => {
      const state = 'test-state-123';
      const authUrl = provider.getAuthorizationUrl(state);

      expect(authUrl).toContain('accounts.google.com');
      expect(authUrl).toContain('client_id=' + config.clientId);
      expect(authUrl).toContain('state=' + state);
      expect(authUrl).toContain('redirect_uri');
      expect(authUrl).toContain('scope=');
    });

    it('should use custom scopes when provided', () => {
      const customProvider = google({
        ...config,
        scopes: ['email', 'https://www.googleapis.com/auth/calendar'],
      });
      
      const authUrl = customProvider.getAuthorizationUrl('state');
      expect(authUrl).toContain('email');
      expect(authUrl).toContain('calendar');
    });

    it('should throw when exchanging code in mock mode', async () => {
      await expect(provider.exchangeCode('test-code')).rejects.toThrow();
    });
  });

  describe('github', () => {
    let provider: OAuthProvider;
    const config: OAuthConfig = {
      clientId: 'test-github-client',
      clientSecret: 'test-github-secret',
    };

    beforeEach(() => {
      provider = github(config);
    });

    it('should create a GitHub provider', () => {
      expect(provider).toBeDefined();
      expect(provider.id).toBe('github');
      expect(provider.name).toBe('GitHub');
    });

    it('should have correct default scopes', () => {
      expect(provider.config.scopes).toContain('read:user');
      expect(provider.config.scopes).toContain('user:email');
    });

    it('should generate valid authorization URL', () => {
      const state = 'github-state-456';
      const authUrl = provider.getAuthorizationUrl(state);

      expect(authUrl).toContain('github.com/login/oauth/authorize');
      expect(authUrl).toContain('client_id=' + config.clientId);
      expect(authUrl).toContain('state=' + state);
      expect(authUrl).toContain('scope=');
    });
  });

  describe('discord', () => {
    let provider: OAuthProvider;
    const config: OAuthConfig = {
      clientId: 'test-discord-client',
      clientSecret: 'test-discord-secret',
    };

    beforeEach(() => {
      provider = discord(config);
    });

    it('should create a Discord provider', () => {
      expect(provider).toBeDefined();
      expect(provider.id).toBe('discord');
      expect(provider.name).toBe('Discord');
    });

    it('should have correct default scopes', () => {
      expect(provider.config.scopes).toContain('identify');
      expect(provider.config.scopes).toContain('email');
    });

    it('should generate valid authorization URL', () => {
      const state = 'discord-state-789';
      const authUrl = provider.getAuthorizationUrl(state);

      expect(authUrl).toContain('discord.com/api/oauth2/authorize');
      expect(authUrl).toContain('client_id=' + config.clientId);
      expect(authUrl).toContain('state=' + state);
      expect(authUrl).toContain('scope=');
    });
  });

  describe('createOAuthProvider (base factory)', () => {
    it('should create a provider with all required properties', () => {
      const provider = createOAuthProvider({
        id: 'test-provider',
        name: 'Test Provider',
        config: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          authUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          userInfoUrl: 'https://auth.example.com/userinfo',
          scopes: ['email', 'profile'],
        },
        transformUserInfo: (data) => ({
          id: data.sub,
          email: data.email,
          name: data.name,
        }),
      });

      expect(provider.id).toBe('test-provider');
      expect(provider.name).toBe('Test Provider');
      expect(provider.config.clientId).toBe('client-id');
      expect(provider.config.scopes).toEqual(['email', 'profile']);
    });

    it('should generate authorization URL with state', () => {
      const provider = createOAuthProvider({
        id: 'test',
        name: 'Test',
        config: {
          clientId: 'id',
          clientSecret: 'secret',
          authUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          userInfoUrl: 'https://auth.example.com/userinfo',
        },
        transformUserInfo: (data) => data as any,
      });

      const url = provider.getAuthorizationUrl('my-state');
      expect(url).toContain('state=my-state');
      expect(url).toContain('client_id=id');
      expect(url).toContain('redirect_uri');
    });
  });

  describe('OAuth flow integration', () => {
    it('should include redirect_uri in authorization URL', () => {
      const provider = google({
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'https://myapp.com/api/auth/oauth/google/callback',
      });

      const url = provider.getAuthorizationUrl('state');
      expect(url).toContain(encodeURIComponent('https://myapp.com/api/auth/oauth/google/callback'));
    });

    it('should allow custom redirect URI', () => {
      const customRedirect = 'https://custom.example.com/callback';
      const provider = github({
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: customRedirect,
      });

      const url = provider.getAuthorizationUrl('state');
      expect(url).toContain(encodeURIComponent(customRedirect));
    });
  });
});
