import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { google } from '../providers/google';

describe('google provider', () => {
  const config = {
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
    redirectUrl: 'http://localhost:3000/api/auth/oauth/google/callback',
  };

  it('has trustEmail: true', () => {
    const provider = google(config);
    expect(provider.trustEmail).toBe(true);
  });

  it('default scopes include openid, email, profile', () => {
    const provider = google(config);
    expect(provider.scopes).toContain('openid');
    expect(provider.scopes).toContain('email');
    expect(provider.scopes).toContain('profile');
  });

  it('getAuthorizationUrl includes client_id, redirect_uri, state, code_challenge', () => {
    const provider = google(config);
    const url = provider.getAuthorizationUrl('test-state', 'test-challenge', 'test-nonce');
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe('google-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(config.redirectUrl);
    expect(parsed.searchParams.get('state')).toBe('test-state');
    expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge');
  });

  it('getAuthorizationUrl includes nonce in params', () => {
    const provider = google(config);
    const url = provider.getAuthorizationUrl('state', 'challenge', 'my-nonce');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('nonce')).toBe('my-nonce');
  });

  it('getAuthorizationUrl uses S256 code_challenge_method', () => {
    const provider = google(config);
    const url = provider.getAuthorizationUrl('state', 'challenge');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
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
            access_token: 'google-access',
            id_token: 'google-id-token',
            expires_in: 3600,
          }),
        );
      };

      const provider = google(config);
      const tokens = await provider.exchangeCode('auth-code', 'verifier-123');
      expect(tokens.accessToken).toBe('google-access');
      expect(tokens.idToken).toBe('google-id-token');
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

    it('decodes ID token and extracts user info', async () => {
      // Create a mock JWT ID token (header.payload.signature)
      const payload = {
        sub: 'google-user-123',
        email: 'user@gmail.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        nonce: 'test-nonce',
      };
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const mockIdToken = `${header}.${body}.fake-signature`;

      const provider = google(config);
      const userInfo = await provider.getUserInfo('access-token', mockIdToken);
      expect(userInfo.providerId).toBe('google-user-123');
      expect(userInfo.email).toBe('user@gmail.com');
      expect(userInfo.emailVerified).toBe(true);
      expect(userInfo.raw.name).toBe('Test User');
      expect(userInfo.raw.picture).toBe('https://example.com/avatar.jpg');
    });

    it('includes raw with OIDC claims from the ID token', async () => {
      const payload = {
        sub: 'google-user-456',
        email: 'user@gmail.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://example.com/photo.jpg',
        given_name: 'Google',
        family_name: 'User',
        locale: 'en',
        hd: 'example.com',
        iat: 1700000000,
        exp: 1700003600,
        aud: 'client-id',
        iss: 'https://accounts.google.com',
      };
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const mockIdToken = `${header}.${body}.fake-signature`;

      const provider = google(config);
      const userInfo = await provider.getUserInfo('access-token', mockIdToken);

      expect(userInfo.raw).toBeDefined();
      expect(userInfo.raw.given_name).toBe('Google');
      expect(userInfo.raw.family_name).toBe('User');
      expect(userInfo.raw.locale).toBe('en');
      expect(userInfo.raw.hd).toBe('example.com');
    });

    it('validates nonce when provided', async () => {
      const payload = {
        sub: 'google-user-123',
        email: 'user@gmail.com',
        email_verified: true,
        nonce: 'correct-nonce',
      };
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const mockIdToken = `${header}.${body}.fake-signature`;

      const provider = google(config);
      // Correct nonce should succeed
      const userInfo = await provider.getUserInfo('access-token', mockIdToken, 'correct-nonce');
      expect(userInfo.providerId).toBe('google-user-123');
    });

    it('rejects ID token with mismatched nonce', async () => {
      const payload = {
        sub: 'google-user-123',
        email: 'user@gmail.com',
        email_verified: true,
        nonce: 'original-nonce',
      };
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const mockIdToken = `${header}.${body}.fake-signature`;

      const provider = google(config);
      expect(provider.getUserInfo('access-token', mockIdToken, 'wrong-nonce')).rejects.toThrow(
        'ID token nonce mismatch',
      );
    });
  });
});
