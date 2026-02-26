/**
 * Auth Module Tests - Phase 1
 * Tests for createAuth(), JWT, password hashing, sign-up/sign-in flows
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createAuth, hashPassword, validatePassword, verifyPassword } from '../../auth/index';
import type { AuthConfig } from '../auth/types';

describe('Auth Module', () => {
  describe('Password Utilities', () => {
    describe('hashPassword', () => {
      it('should hash a password', { timeout: 15_000 }, async () => {
        const hash = await hashPassword('testPassword123');
        expect(hash).toBeDefined();
        expect(hash).not.toBe('testPassword123');
        expect(hash.length).toBeGreaterThan(20);
      });

      it(
        'should produce different hashes for same password (salting)',
        { timeout: 15_000 },
        async () => {
          const hash1 = await hashPassword('testPassword123');
          const hash2 = await hashPassword('testPassword123');
          expect(hash1).not.toBe(hash2);
        },
      );

      it('should use bcrypt cost of 12', { timeout: 15_000 }, async () => {
        const hash = await hashPassword('test');
        expect(hash.startsWith('$2b$12$')).toBe(true);
      });
    });

    describe('verifyPassword', () => {
      it('should verify correct password', { timeout: 15_000 }, async () => {
        const password = 'testPassword123';
        const hash = await hashPassword(password);
        const valid = await verifyPassword(password, hash);
        expect(valid).toBe(true);
      });

      it('should reject incorrect password', { timeout: 15_000 }, async () => {
        const hash = await hashPassword('correctPassword');
        const valid = await verifyPassword('wrongPassword', hash);
        expect(valid).toBe(false);
      });
    });

    describe('validatePassword', () => {
      it('should accept valid password', () => {
        const result = validatePassword('password123');
        expect(result).toBeNull();
      });

      it('should reject short password', () => {
        const result = validatePassword('short', { minLength: 8 });
        expect(result).not.toBeNull();
        expect(result?.code).toBe('AUTH_VALIDATION_ERROR');
        expect(result?.field).toBe('password');
        expect(result?.constraint).toBe('TOO_SHORT');
      });

      it('should reject password without uppercase when required', () => {
        const result = validatePassword('password123', { requireUppercase: true });
        expect(result?.code).toBe('AUTH_VALIDATION_ERROR');
        expect(result?.constraint).toBe('NO_UPPERCASE');
      });

      it('should reject password without numbers when required', () => {
        const result = validatePassword('PasswordABC', { requireNumbers: true });
        expect(result?.code).toBe('AUTH_VALIDATION_ERROR');
        expect(result?.constraint).toBe('NO_NUMBER');
      });

      it('should reject password without symbols when required', () => {
        const result = validatePassword('Password123', { requireSymbols: true });
        expect(result?.code).toBe('AUTH_VALIDATION_ERROR');
        expect(result?.constraint).toBe('NO_SYMBOL');
      });

      it('should use default requirements when not specified', () => {
        const result = validatePassword('abc'); // Too short
        expect(result?.code).toBe('AUTH_VALIDATION_ERROR');
        expect(result?.constraint).toBe('TOO_SHORT');
      });
    });
  });

  describe('createAuth', () => {
    let authConfig: AuthConfig;

    beforeEach(() => {
      authConfig = {
        session: {
          strategy: 'jwt',
          ttl: '7d',
        },
        emailPassword: {
          enabled: true,
        },
        jwtSecret: 'test-secret-key-for-testing',
      };
    });

    describe('Auth Creation', () => {
      it('should create an auth instance', () => {
        const auth = createAuth(authConfig);
        expect(auth).toBeDefined();
        expect(auth.handler).toBeDefined();
        expect(auth.api).toBeDefined();
        expect(auth.middleware).toBeDefined();
        expect(auth.initialize).toBeDefined();
      });

      it('should use default JWT secret from env if not provided', () => {
        const auth = createAuth({
          session: { strategy: 'jwt', ttl: '7d' },
        });
        expect(auth).toBeDefined();
      });

      it('should initialize without errors', async () => {
        const auth = createAuth(authConfig);
        // Initialize should not throw and should resolve
        const result = await auth.initialize();
        expect(result).toBeUndefined();
      });
    });

    describe('Sign Up', () => {
      it('should sign up a new user', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);
        const result = await auth.api.signUp({
          email: 'test@example.com',
          password: 'password123',
        });

        expect(result.ok).toBe(true);
        expect(result.data?.user.email).toBe('test@example.com');
        expect(result.data?.user.role).toBe('user');
        expect(result.data?.payload).toBeDefined();
      });

      it('should sign up with custom role', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);
        const result = await auth.api.signUp({
          email: 'admin@example.com',
          password: 'password123',
          role: 'admin',
        });

        expect(result.ok).toBe(true);
        expect(result.data?.user.role).toBe('admin');
      });

      it('should reject invalid email', async () => {
        const auth = createAuth(authConfig);
        const result = await auth.api.signUp({
          email: 'invalid-email',
          password: 'password123',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('AUTH_VALIDATION_ERROR');
          expect(result.error).toHaveProperty('field', 'email');
        }
      });

      it('should reject weak password', async () => {
        const auth = createAuth(authConfig);
        const result = await auth.api.signUp({
          email: 'test@example.com',
          password: 'short',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('AUTH_VALIDATION_ERROR');
          expect(result.error).toHaveProperty('field', 'password');
          expect(result.error).toHaveProperty('constraint', 'TOO_SHORT');
        }
      });

      it('should reject duplicate email', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        await auth.api.signUp({
          email: 'duplicate@example.com',
          password: 'password123',
        });

        const result = await auth.api.signUp({
          email: 'duplicate@example.com',
          password: 'password123',
        });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('USER_EXISTS');
      });

      it('should include custom claims in JWT', { timeout: 15_000 }, async () => {
        const auth = createAuth({
          ...authConfig,
          claims: (_user) => ({ plan: 'premium', tier: 2 }),
        });

        const result = await auth.api.signUp({
          email: 'claims@example.com',
          password: 'password123',
        });

        expect(result.ok).toBe(true);
        expect(result.data?.payload.claims).toEqual({ plan: 'premium', tier: 2 });
      });
    });

    describe('Sign In', () => {
      it('should sign in with correct credentials', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        // First sign up
        await auth.api.signUp({
          email: 'login@example.com',
          password: 'password123',
        });

        // Then sign in
        const result = await auth.api.signIn({
          email: 'login@example.com',
          password: 'password123',
        });

        expect(result.ok).toBe(true);
        expect(result.data?.user.email).toBe('login@example.com');
      });

      it('should reject invalid email', async () => {
        const auth = createAuth(authConfig);
        const result = await auth.api.signIn({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_CREDENTIALS');
      });

      it('should reject wrong password', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        await auth.api.signUp({
          email: 'wrongpass@example.com',
          password: 'correctPassword',
        });

        const result = await auth.api.signIn({
          email: 'wrongpass@example.com',
          password: 'wrongPassword',
        });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_CREDENTIALS');
      });

      it('should be case-insensitive for email', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        await auth.api.signUp({
          email: 'CaseTest@Example.com',
          password: 'password123',
        });

        const result = await auth.api.signIn({
          email: 'casetest@example.com',
          password: 'password123',
        });

        expect(result.ok).toBe(true);
      });
    });

    describe('Session Management', () => {
      it('should get session from headers', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        const signUpResult = await auth.api.signUp({
          email: 'session@example.com',
          password: 'password123',
        });

        expect(signUpResult.ok).toBe(true);

        // Create headers with session (in real scenario, cookie would be set)
        const headers = new Headers();
        headers.set('cookie', 'vertz.sid=test-token');

        const result = await auth.api.getSession(headers);
        // Without valid token, should return null
        expect(result.ok).toBe(true);
        expect(result.data).toBeNull();
      });

      it('should sign out and clear session', async () => {
        const auth = createAuth(authConfig);

        const result = await auth.api.signOut({ headers: new Headers() });
        expect(result.ok).toBe(true);
      });
    });

    describe('HTTP Handler', () => {
      it('should handle POST /api/auth/signup', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        const response = await auth.handler(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'handler@example.com',
              password: 'password123',
            }),
          }),
        );

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.user).toBeDefined();
      });

      it('should handle POST /api/auth/signin', { timeout: 15_000 }, async () => {
        const auth = createAuth(authConfig);

        // First create user
        await auth.api.signUp({
          email: 'handlerlogin@example.com',
          password: 'password123',
        });

        // Then try to sign in via handler
        const response = await auth.handler(
          new Request('http://localhost/api/auth/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'handlerlogin@example.com',
              password: 'password123',
            }),
          }),
        );

        expect(response.status).toBe(200);
      });

      it('should handle GET /api/auth/session', async () => {
        const auth = createAuth(authConfig);

        const response = await auth.handler(
          new Request('http://localhost/api/auth/session', {
            method: 'GET',
          }),
        );

        expect(response.status).toBe(200);
      });

      it('should return 404 for unknown routes', async () => {
        const auth = createAuth(authConfig);

        const response = await auth.handler(
          new Request('http://localhost/api/auth/unknown', {
            method: 'GET',
          }),
        );

        expect(response.status).toBe(404);
      });
    });

    describe('Rate Limiting', () => {
      it('should rate limit sign-in attempts', { timeout: 30_000 }, async () => {
        const auth = createAuth({
          ...authConfig,
          emailPassword: {
            enabled: true,
            rateLimit: { window: '1m', maxAttempts: 3 },
          },
        });

        // First sign up so we have a user to attack
        await auth.api.signUp({
          email: 'ratelimit@example.com',
          password: 'password123',
        });

        // Try to sign in multiple times with wrong password
        for (let i = 0; i < 3; i++) {
          await auth.api.signIn({
            email: 'ratelimit@example.com',
            password: 'wrongpassword',
          });
        }

        // 4th attempt should be rate limited
        const result = await auth.api.signIn({
          email: 'ratelimit@example.com',
          password: 'wrongpassword',
        });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('RATE_LIMITED');
      });
    });
  });
});
