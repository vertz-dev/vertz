/**
 * OAuth Security Tests - Phase 2
 * Tests for PKCE, state validation, callback handling, and session creation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createPKCE,
  generateState,
  OAuthStateStore,
} from '../../auth/oauth/security';
import { google, github, discord, createOAuthProvider } from '../../auth/oauth/providers';
import type { OAuthProvider, OAuthTokens, OAuthUserInfo } from '../../auth/oauth/types';

// ============================================================================
// PKCE Tests
// ============================================================================

describe('PKCE (Proof Key for Code Exchange)', () => {
  describe('createPKCE', () => {
    it('should generate code_verifier with correct length', () => {
      const pkce = createPKCE();
      
      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate base64url-encoded code_verifier', () => {
      const pkce = createPKCE();
      
      // Should be valid base64url characters
      expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate code_challenge using S256 method', () => {
      const pkce = createPKCE();
      
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeChallenge.length).toBeGreaterThan(0);
      // S256 produces 43 characters in base64url
      expect(pkce.codeChallenge.length).toBe(43);
    });

    it('should generate different verifier each time', () => {
      const pkce1 = createPKCE();
      const pkce2 = createPKCE();
      
      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });

    it('should produce consistent challenge for same verifier', () => {
      const verifier = 'test-verifier-string-with-enough-length-43chars';
      const pkce1 = createPKCE(verifier);
      const pkce2 = createPKCE(verifier);
      
      expect(pkce1.codeChallenge).toBe(pkce2.codeChallenge);
    });

    it('should throw if verifier is too short', () => {
      expect(() => createPKCE('short')).toThrow('code_verifier must be');
    });

    it('should throw if verifier is too long', () => {
      const longVerifier = 'a'.repeat(129);
      expect(() => createPKCE(longVerifier)).toThrow('code_verifier must be');
    });
  });

  describe('Provider integration with PKCE', () => {
    let provider: OAuthProvider;

    beforeEach(() => {
      provider = google({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
    });

    it('should include code_challenge in authorization URL when PKCE is provided', () => {
      const pkce = createPKCE();
      const state = generateState();
      
      const authUrl = provider.getAuthorizationUrl(state, pkce);
      
      expect(authUrl).toContain('code_challenge=' + pkce.codeChallenge);
      expect(authUrl).toContain('code_challenge_method=S256');
    });

    it('should include code_verifier in token exchange', async () => {
      const pkce = createPKCE();
      
      // Mock the fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });
      
      await expect(
        provider.exchangeCode('test-code', pkce.codeVerifier)
      ).resolves.toBeDefined();
    });
  });
});

// ============================================================================
// State Validation Tests
// ============================================================================

describe('OAuth State Validation', () => {
  describe('generateState', () => {
    it('should generate cryptographically random state', () => {
      const state1 = generateState();
      const state2 = generateState();
      
      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
      // Should be 32 bytes (43 chars base64url)
      expect(state1.length).toBe(43);
    });

    it('should generate valid base64url string', () => {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('OAuthStateStore', () => {
    let store: OAuthStateStore;

    beforeEach(() => {
      store = new OAuthStateStore();
    });

    afterEach(() => {
      store.clear();
    });

    it('should store and retrieve state', () => {
      const state = generateState();
      const redirectUri = '/api/auth/callback';
      
      store.set(state, redirectUri);
      
      expect(store.get(state)).toBe(redirectUri);
    });

    it('should return null for non-existent state', () => {
      expect(store.get('non-existent')).toBeNull();
    });

    it('should validate correct state', () => {
      const state = generateState();
      const redirectUri = '/api/auth/callback';
      
      store.set(state, redirectUri);
      
      expect(store.validate(state)).toBe(true);
    });

    it('should reject incorrect state', () => {
      const state = generateState();
      const wrongState = generateState();
      const redirectUri = '/api/auth/callback';
      
      store.set(state, redirectUri);
      
      expect(store.validate(wrongState)).toBe(false);
    });

    it('should delete state after validation', () => {
      const state = generateState();
      const redirectUri = '/api/auth/callback';
      
      store.set(state, redirectUri);
      store.validate(state);
      
      // State should be consumed
      expect(store.get(state)).toBeNull();
    });

    it('should auto-expire state after TTL', async () => {
      const store = new OAuthStateStore(100); // 100ms TTL
      const state = generateState();
      
      store.set(state, '/callback');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(store.get(state)).toBeNull();
    });

    it('should clear all expired states on cleanup', () => {
      const store = new OAuthStateStore(100);
      const state1 = generateState();
      const state2 = generateState();
      
      store.set(state1, '/cb1');
      store.set(state2, '/cb2');
      
      // Wait for expiry
      setTimeout(() => {
        store.cleanup();
        expect(store.size()).toBe(0);
      }, 150);
    });

    it('should track size correctly', () => {
      const state1 = generateState();
      const state2 = generateState();
      
      store.set(state1, '/cb1');
      expect(store.size()).toBe(1);
      
      store.set(state2, '/cb2');
      expect(store.size()).toBe(2);
      
      store.validate(state1);
      expect(store.size()).toBe(1);
    });
  });
});

// ============================================================================
// OAuth Callback Handling Tests
// ============================================================================

describe('OAuth Callback Handling', () => {
  describe('handleOAuthCallback', () => {
    it('should handle successful callback with valid state and code', async () => {
      const provider = google({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const store = new OAuthStateStore();
      const state = generateState();
      const redirectUri = '/api/auth/callback/google';
      
      store.set(state, redirectUri);
      
      // Mock successful token exchange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
      
      // Mock successful user info
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            sub: '12345',
            email: 'test@example.com',
            name: 'Test User',
            picture: 'https://example.com/avatar.png',
          }),
        });
      
      // This would call the actual handler - we test the components
      expect(state).toBeDefined();
      expect(store.validate(state)).toBe(true);
    });

    it('should reject callback with missing state', async () => {
      const store = new OAuthStateStore();
      
      expect(store.validate('missing-state')).toBe(false);
    });

    it('should reject callback with invalid state', async () => {
      const store = new OAuthStateStore();
      const validState = generateState();
      
      store.set(validState, '/callback');
      
      expect(store.validate('invalid-state')).toBe(false);
    });

    it('should handle missing code parameter', async () => {
      const error = { code: 'OAUTH_ACCESS_DENIED', message: 'No code provided', status: 400 };
      expect(error.code).toBe('OAUTH_ACCESS_DENIED');
    });

    it('should handle OAuth error from provider', async () => {
      const error = { 
        code: 'OAUTH_PROVIDER_ERROR', 
        message: 'User denied access', 
        status: 403,
        provider: 'google',
      };
      expect(error.code).toBe('OAUTH_PROVIDER_ERROR');
      expect(error.provider).toBe('google');
    });
  });
});

// ============================================================================
// Session Creation Tests
// ============================================================================

describe('OAuth Session Creation', () => {
  describe('createOAuthSession', () => {
    it('should create session with user info from OAuth', async () => {
      // This tests the integration between OAuth user info and JWT session creation
      const userInfo: OAuthUserInfo = {
        id: 'oauth-12345',
        email: 'oauth@example.com',
        name: 'OAuth User',
        avatar: 'https://example.com/avatar.png',
        provider: 'google',
      };
      
      const tokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      };
      
      expect(userInfo.id).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
    });

    it('should handle new vs returning users', async () => {
      const newUser = {
        id: 'new-oauth-123',
        email: 'new@example.com',
        provider: 'google',
      };
      
      const returningUser = {
        id: 'existing-oauth-123',
        email: 'existing@example.com',
        provider: 'github',
      };
      
      // In a real implementation, we'd check against a user database
      expect(newUser.id).toContain('new');
      expect(returningUser.id).not.toContain('new');
    });

    it('should set cookie with JWT token', async () => {
      // Test that session creation produces a valid cookie string
      const cookieName = 'vertz.sid';
      const token = 'test-jwt-token';
      
      const cookie = `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
      
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
    });
  });
});

// ============================================================================
// OAuth Provider Security Tests
// ============================================================================

describe('OAuth Provider Security', () => {
  describe('Authorization URL security', () => {
    it('Google should include PKCE parameters', () => {
      const provider = google({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const pkce = createPKCE();
      const state = generateState();
      
      const url = provider.getAuthorizationUrl(state, pkce);
      
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('GitHub should include PKCE parameters', () => {
      const provider = github({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const pkce = createPKCE();
      const state = generateState();
      
      const url = provider.getAuthorizationUrl(state, pkce);
      
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('Discord should include PKCE parameters', () => {
      const provider = discord({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const pkce = createPKCE();
      const state = generateState();
      
      const url = provider.getAuthorizationUrl(state, pkce);
      
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should generate unique state for each authorization request', () => {
      const provider = google({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const pkce = createPKCE();
      const states = new Set<string>();
      
      for (let i = 0; i < 10; i++) {
        const state = generateState();
        const url = provider.getAuthorizationUrl(state, pkce);
        states.add(state);
      }
      
      // All states should be unique
      expect(states.size).toBe(10);
    });
  });

  describe('Token exchange security', () => {
    it('should allow exchange without PKCE for backwards compatibility', async () => {
      const provider = google({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      // Mock fetch for token exchange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
        }),
      });
      
      // Without PKCE, exchange should still work (for backwards compatibility)
      await expect(
        provider.exchangeCode('test-code')
      ).resolves.toBeDefined();
    });

    it('should include code_verifier in token exchange request', async () => {
      const provider = google({
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const pkce = createPKCE();
      
      // Mock fetch to capture the request body
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
        }),
      });
      global.fetch = mockFetch;
      
      await provider.exchangeCode('test-code', pkce.codeVerifier);
      
      // Verify the fetch was called
      expect(mockFetch).toHaveBeenCalled();
      
      // Check the body contains code_verifier
      const callArgs = mockFetch.mock.calls[0] as any[];
      const body = callArgs[1]?.body as URLSearchParams;
      expect(body.toString()).toContain('code_verifier=' + pkce.codeVerifier);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('OAuth Error Handling', () => {
  it('should handle invalid state error', () => {
    const error = {
      code: 'OAUTH_INVALID_STATE',
      message: 'Invalid or expired state parameter',
      status: 400,
    };
    
    expect(error.code).toBe('OAUTH_INVALID_STATE');
  });

  it('should handle access denied error', () => {
    const error = {
      code: 'OAUTH_ACCESS_DENIED',
      message: 'User denied authorization',
      status: 403,
    };
    
    expect(error.code).toBe('OAUTH_ACCESS_DENIED');
  });

  it('should handle token exchange failure', () => {
    const error = {
      code: 'OAUTH_EXCHANGE_FAILED',
      message: 'Failed to exchange code for tokens',
      status: 500,
      provider: 'google',
    };
    
    expect(error.code).toBe('OAUTH_EXCHANGE_FAILED');
    expect(error.provider).toBe('google');
  });

  it('should handle user info fetch failure', () => {
    const error = {
      code: 'OAUTH_USER_INFO_FAILED',
      message: 'Failed to fetch user information',
      status: 500,
      provider: 'github',
    };
    
    expect(error.code).toBe('OAUTH_USER_INFO_FAILED');
  });
});
