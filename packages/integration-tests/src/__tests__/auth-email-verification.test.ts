/**
 * Integration Test: Email Verification & Password Reset
 * Uses @vertz/server public imports only — validates the full email verification
 * and password reset lifecycle end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { AuthConfig, AuthInstance } from '@vertz/server';
import { createAuth } from '@vertz/server';

function createTestAuth(overrides?: Partial<AuthConfig>): {
  auth: AuthInstance;
  sentVerifications: { email: string; token: string }[];
  sentResets: { email: string; token: string }[];
} {
  const sentVerifications: { email: string; token: string }[] = [];
  const sentResets: { email: string; token: string }[] = [];

  const auth = createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    jwtSecret: 'integration-test-secret-at-least-32-chars',
    isProduction: false,
    emailVerification: {
      enabled: true,
      tokenTtl: '24h',
      onSend: async (user, token) => {
        sentVerifications.push({ email: user.email, token });
      },
    },
    passwordReset: {
      enabled: true,
      tokenTtl: '1h',
      onSend: async (user, token) => {
        sentResets.push({ email: user.email, token });
      },
    },
    ...overrides,
  });

  return { auth, sentVerifications, sentResets };
}

function postJson(auth: AuthInstance, path: string, body: unknown, cookies = '') {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
    'X-VTZ-Request': '1',
  };
  if (cookies) {
    headers.Cookie = cookies;
  }
  return auth.handler(
    new Request(`http://localhost/api/auth${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function extractCookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

describe('Email Verification & Password Reset (Integration)', () => {
  let auth: AuthInstance;
  let sentVerifications: { email: string; token: string }[];
  let sentResets: { email: string; token: string }[];

  beforeEach(() => {
    const result = createTestAuth();
    auth = result.auth;
    sentVerifications = result.sentVerifications;
    sentResets = result.sentResets;
  });

  afterEach(() => {
    auth.dispose();
  });

  describe('Full lifecycle: signup → verify → reset → sign in', () => {
    it('completes the full email verification and password reset flow', async () => {
      // 1. Sign up — should send verification email
      const signUpRes = await postJson(auth, '/signup', {
        email: 'test@example.com',
        password: 'OriginalPass123!',
      });
      expect(signUpRes.status).toBe(201);

      const signUpData = await signUpRes.json();
      expect(signUpData.user.emailVerified).toBe(false);
      expect(sentVerifications).toHaveLength(1);
      expect(sentVerifications[0].email).toBe('test@example.com');

      // 2. Verify email with token
      const verifyToken = sentVerifications[0].token;
      const verifyRes = await postJson(auth, '/verify-email', { token: verifyToken });
      expect(verifyRes.status).toBe(200);

      // 3. Sign in — should have emailVerified: true
      const signInRes = await postJson(auth, '/signin', {
        email: 'test@example.com',
        password: 'OriginalPass123!',
      });
      expect(signInRes.status).toBe(200);
      const signInData = await signInRes.json();
      expect(signInData.user.emailVerified).toBe(true);

      const cookies = extractCookies(signInRes);

      // 4. Request password reset
      const forgotRes = await postJson(auth, '/forgot-password', {
        email: 'test@example.com',
      });
      expect(forgotRes.status).toBe(200);
      expect(sentResets).toHaveLength(1);

      // 5. Reset password with token
      const resetToken = sentResets[0].token;
      const resetRes = await postJson(auth, '/reset-password', {
        token: resetToken,
        password: 'NewPassword456!',
      });
      expect(resetRes.status).toBe(200);

      // 6. Old session should be revoked — refresh fails
      const refreshRes = await postJson(auth, '/refresh', {});
      // No valid cookies — should fail
      expect(refreshRes.status).toBe(401);

      // 7. Sign in with new password
      const newSignInRes = await postJson(auth, '/signin', {
        email: 'test@example.com',
        password: 'NewPassword456!',
      });
      expect(newSignInRes.status).toBe(200);

      // 8. Old password should fail
      const oldSignInRes = await postJson(auth, '/signin', {
        email: 'test@example.com',
        password: 'OriginalPass123!',
      });
      expect(oldSignInRes.status).toBe(401);
    });
  });

  describe('Email verification', () => {
    it('sends verification email on sign-up when enabled', async () => {
      const res = await postJson(auth, '/signup', {
        email: 'verify@example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(201);
      expect(sentVerifications).toHaveLength(1);
      expect(sentVerifications[0].email).toBe('verify@example.com');
    });

    it('marks email as verified with valid token', async () => {
      await postJson(auth, '/signup', {
        email: 'verify@example.com',
        password: 'Password123!',
      });
      const token = sentVerifications[0].token;

      const res = await postJson(auth, '/verify-email', { token });
      expect(res.status).toBe(200);

      // Confirm emailVerified in session
      const signInRes = await postJson(auth, '/signin', {
        email: 'verify@example.com',
        password: 'Password123!',
      });
      const data = await signInRes.json();
      expect(data.user.emailVerified).toBe(true);
    });

    it('unverified user can sign in but has emailVerified: false', async () => {
      await postJson(auth, '/signup', {
        email: 'unverified@example.com',
        password: 'Password123!',
      });

      const signInRes = await postJson(auth, '/signin', {
        email: 'unverified@example.com',
        password: 'Password123!',
      });
      expect(signInRes.status).toBe(200);
      const data = await signInRes.json();
      expect(data.user.emailVerified).toBe(false);
    });

    it('rate limits resend-verification (3/hour)', async () => {
      const signUpRes = await postJson(auth, '/signup', {
        email: 'rate@example.com',
        password: 'Password123!',
      });
      const cookies = extractCookies(signUpRes);

      for (let i = 0; i < 3; i++) {
        const res = await postJson(auth, '/resend-verification', {}, cookies);
        expect(res.status).toBe(200);
      }

      const res = await postJson(auth, '/resend-verification', {}, cookies);
      expect(res.status).toBe(429);
    });
  });

  describe('Password reset', () => {
    it('forgot-password returns 200 for unknown email (no enumeration)', async () => {
      const res = await postJson(auth, '/forgot-password', {
        email: 'nobody@example.com',
      });
      expect(res.status).toBe(200);
      expect(sentResets).toHaveLength(0);
    });

    it('forgot-password calls onSend for existing user', async () => {
      await postJson(auth, '/signup', {
        email: 'exists@example.com',
        password: 'Password123!',
      });

      const res = await postJson(auth, '/forgot-password', {
        email: 'exists@example.com',
      });
      expect(res.status).toBe(200);
      expect(sentResets).toHaveLength(1);
    });

    it('resets password with valid token', async () => {
      await postJson(auth, '/signup', {
        email: 'reset@example.com',
        password: 'OldPassword123!',
      });

      await postJson(auth, '/forgot-password', { email: 'reset@example.com' });
      const token = sentResets[0].token;

      const res = await postJson(auth, '/reset-password', {
        token,
        password: 'NewPassword456!',
      });
      expect(res.status).toBe(200);

      // New password works
      const signInRes = await postJson(auth, '/signin', {
        email: 'reset@example.com',
        password: 'NewPassword456!',
      });
      expect(signInRes.status).toBe(200);
    });

    it('rate limits forgot-password (3/hour per email)', async () => {
      await postJson(auth, '/signup', {
        email: 'ratelimit@example.com',
        password: 'Password123!',
      });

      for (let i = 0; i < 3; i++) {
        await postJson(auth, '/forgot-password', { email: 'ratelimit@example.com' });
      }

      // 4th still returns 200 but does not call onSend
      const res = await postJson(auth, '/forgot-password', { email: 'ratelimit@example.com' });
      expect(res.status).toBe(200);
      expect(sentResets).toHaveLength(3);
    });
  });
});
