import { describe, expect, it } from '@vertz/test';
import { discord } from './discord';
import { github } from './github';
import { google } from './google';

describe('Provider factories — cloud mode (CloudOAuthProviderConfig)', () => {
  describe('Given github() with cloud config (no clientId)', () => {
    it('then returns OAuthProvider with cloud-specific properties', () => {
      const provider = github({ scopes: ['read:user'] });
      expect(provider.id).toBe('github');
      expect(provider.name).toBe('GitHub');
      expect(provider.scopes).toEqual(['read:user']);
      expect(provider.trustEmail).toBe(false);
    });

    it('then getAuthorizationUrl() throws cloud mode error', () => {
      const provider = github({});
      expect(() => provider.getAuthorizationUrl('state')).toThrow('not available in cloud mode');
    });

    it('then exchangeCode() throws cloud mode error', async () => {
      const provider = github({});
      await expect(provider.exchangeCode('code')).rejects.toThrow('not available in cloud mode');
    });

    it('then getUserInfo() throws cloud mode error', async () => {
      const provider = github({});
      await expect(provider.getUserInfo('token')).rejects.toThrow('not available in cloud mode');
    });

    it('then uses default scopes when none provided', () => {
      const provider = github({});
      expect(provider.scopes).toEqual(['read:user', 'user:email']);
    });
  });

  describe('Given google() with cloud config', () => {
    it('then returns OAuthProvider for Google', () => {
      const provider = google({});
      expect(provider.id).toBe('google');
      expect(provider.name).toBe('Google');
      expect(provider.trustEmail).toBe(true);
      expect(provider.scopes).toEqual(['openid', 'email', 'profile']);
    });

    it('then getAuthorizationUrl() throws cloud mode error', () => {
      const provider = google({});
      expect(() => provider.getAuthorizationUrl('state')).toThrow('not available in cloud mode');
    });
  });

  describe('Given discord() with cloud config', () => {
    it('then returns OAuthProvider for Discord', () => {
      const provider = discord({});
      expect(provider.id).toBe('discord');
      expect(provider.name).toBe('Discord');
      expect(provider.trustEmail).toBe(false);
      expect(provider.scopes).toEqual(['identify', 'email']);
    });

    it('then getAuthorizationUrl() throws cloud mode error', () => {
      const provider = discord({});
      expect(() => provider.getAuthorizationUrl('state')).toThrow('not available in cloud mode');
    });
  });

  describe('Given github() with self-hosted config (has clientId)', () => {
    it('then requires clientId and clientSecret', () => {
      const provider = github({
        clientId: 'gh_id',
        clientSecret: 'gh_secret',
        redirectUrl: 'http://localhost/callback',
      });
      expect(provider.id).toBe('github');
      // Should NOT throw — self-hosted mode works normally
      const url = provider.getAuthorizationUrl('test-state');
      expect(url).toContain('client_id=gh_id');
    });
  });
});
