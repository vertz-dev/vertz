import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { discord } from '../providers/discord';

describe('discord provider', () => {
  const config = {
    clientId: 'discord-client-id',
    clientSecret: 'discord-client-secret',
    redirectUrl: 'http://localhost:3000/api/auth/oauth/discord/callback',
  };

  it('has trustEmail: false', () => {
    const provider = discord(config);
    expect(provider.trustEmail).toBe(false);
  });

  it('default scopes include identify, email', () => {
    const provider = discord(config);
    expect(provider.scopes).toContain('identify');
    expect(provider.scopes).toContain('email');
  });

  it('getAuthorizationUrl includes client_id, redirect_uri, state, code_challenge', () => {
    const provider = discord(config);
    const url = provider.getAuthorizationUrl('test-state', 'test-challenge');
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('discord.com');
    expect(parsed.searchParams.get('client_id')).toBe('discord-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(config.redirectUrl);
    expect(parsed.searchParams.get('state')).toBe('test-state');
    expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge');
  });

  describe('exchangeCode', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('sends POST with code and code_verifier', async () => {
      let capturedBody: string | undefined;
      globalThis.fetch = async (_input, init) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            access_token: 'discord-access',
            token_type: 'Bearer',
            expires_in: 604800,
          }),
        );
      };

      const provider = discord(config);
      const tokens = await provider.exchangeCode('auth-code', 'verifier-123');
      expect(tokens.accessToken).toBe('discord-access');
      expect(capturedBody).toContain('code=auth-code');
      expect(capturedBody).toContain('code_verifier=verifier-123');
    });
  });

  describe('getUserInfo', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('fetches /users/@me endpoint', async () => {
      let capturedUrl = '';
      globalThis.fetch = async (input) => {
        capturedUrl = typeof input === 'string' ? input : (input as Request).url;
        return new Response(
          JSON.stringify({
            id: '123456789',
            username: 'discorduser',
            email: 'user@discord.com',
            verified: true,
            avatar: 'abc123',
            global_name: 'Discord User',
          }),
        );
      };

      const provider = discord(config);
      const userInfo = await provider.getUserInfo('discord-token');
      expect(capturedUrl).toBe('https://discord.com/api/users/@me');
      expect(userInfo.providerId).toBe('123456789');
      expect(userInfo.email).toBe('user@discord.com');
      expect(userInfo.emailVerified).toBe(true);
      expect(userInfo.raw.global_name).toBe('Discord User');
    });

    it('includes raw with the full Discord API response', async () => {
      const discordUserData = {
        id: '123456789',
        username: 'discorduser',
        discriminator: '1234',
        global_name: 'Discord User',
        avatar: 'abc123',
        banner: 'def456',
        accent_color: 0x1abc9c,
        email: 'user@discord.com',
        verified: true,
        locale: 'en-US',
        mfa_enabled: true,
        premium_type: 2,
        public_flags: 131072,
      };
      globalThis.fetch = async () => new Response(JSON.stringify(discordUserData));

      const provider = discord(config);
      const userInfo = await provider.getUserInfo('discord-token');

      expect(userInfo.raw).toBeDefined();
      expect(userInfo.raw.username).toBe('discorduser');
      expect(userInfo.raw.discriminator).toBe('1234');
      expect(userInfo.raw.locale).toBe('en-US');
      expect(userInfo.raw.mfa_enabled).toBe(true);
      expect(userInfo.raw.premium_type).toBe(2);
    });
  });
});
