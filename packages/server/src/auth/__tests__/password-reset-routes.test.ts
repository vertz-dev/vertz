import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthInstance } from '../types';

function createTestAuth(opts?: { tokenTtl?: string; revokeSessionsOnReset?: boolean }) {
  const sentEmails: { email: string; token: string }[] = [];

  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    emailPassword: { enabled: true },
    jwtSecret: 'test-secret-for-password-reset-testing-1234567890',
    isProduction: false,
    passwordReset: {
      enabled: true,
      tokenTtl: opts?.tokenTtl ?? '1h',
      revokeSessionsOnReset: opts?.revokeSessionsOnReset,
      onSend: async (user: { email: string }, token: string) => {
        sentEmails.push({ email: user.email, token });
      },
    },
  });

  return { auth, sentEmails };
}

async function postJson(
  auth: AuthInstance,
  path: string,
  body: Record<string, unknown>,
  cookies = '',
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
    'X-VTZ-Request': '1',
  };
  if (cookies) {
    headers.Cookie = cookies;
  }
  const req = new Request(`http://localhost/api/auth${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return auth.handler(req);
}

async function signUp(auth: AuthInstance, email: string, password = 'Password123!') {
  return postJson(auth, '/signup', { email, password });
}

describe('Password Reset Routes', () => {
  let auth: AuthInstance;
  let sentEmails: { email: string; token: string }[];

  beforeEach(() => {
    const result = createTestAuth();
    auth = result.auth;
    sentEmails = result.sentEmails;
  });

  afterEach(() => {
    auth.dispose();
  });

  it('forgot-password returns 200 for existing user and calls onSend', async () => {
    await signUp(auth, 'user@example.com');
    const res = await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe('user@example.com');
    expect(sentEmails[0].token).toHaveLength(64); // 32 bytes hex
  });

  it('forgot-password returns 200 for non-existent email (no enumeration)', async () => {
    const res = await postJson(auth, '/forgot-password', { email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(0);
  });

  it('rate limits forgot-password to 3 per hour per email', async () => {
    await signUp(auth, 'user@example.com');

    for (let i = 0; i < 3; i++) {
      const res = await postJson(auth, '/forgot-password', { email: 'user@example.com' });
      expect(res.status).toBe(200);
    }

    // 4th should still return 200 (no enumeration) but not call onSend
    const res = await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    expect(res.status).toBe(200);
    // onSend called 3 times, not 4
    expect(sentEmails).toHaveLength(3);
  });

  it('resets password with valid token', async () => {
    await signUp(auth, 'user@example.com');
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    const token = sentEmails[0].token;

    const res = await postJson(auth, '/reset-password', {
      token,
      password: 'NewPassword456!',
    });
    expect(res.status).toBe(200);

    // Can sign in with new password
    const signInRes = await postJson(auth, '/signin', {
      email: 'user@example.com',
      password: 'NewPassword456!',
    });
    expect(signInRes.status).toBe(200);
  });

  it('old password no longer works after reset', async () => {
    await signUp(auth, 'user@example.com', 'OldPassword123!');
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    const token = sentEmails[0].token;

    await postJson(auth, '/reset-password', {
      token,
      password: 'NewPassword456!',
    });

    // Old password should fail
    const signInRes = await postJson(auth, '/signin', {
      email: 'user@example.com',
      password: 'OldPassword123!',
    });
    expect(signInRes.status).toBe(401);
  });

  it('deletes all reset tokens after successful reset', async () => {
    await signUp(auth, 'user@example.com');

    // Generate two reset tokens
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });

    const token1 = sentEmails[0].token;
    const token2 = sentEmails[1].token;

    // Use token2 to reset
    const res = await postJson(auth, '/reset-password', {
      token: token2,
      password: 'NewPassword456!',
    });
    expect(res.status).toBe(200);

    // token1 should now be invalid (all tokens deleted)
    const res2 = await postJson(auth, '/reset-password', {
      token: token1,
      password: 'AnotherPassword789!',
    });
    expect(res2.status).toBe(400);
    const data = await res2.json();
    expect(data.error.code).toBe('TOKEN_INVALID');
  });

  it('revokes all sessions on password reset (default)', async () => {
    // Sign up and get session cookies
    const signupRes = await signUp(auth, 'user@example.com');
    const cookies = signupRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    // Trigger password reset
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    const token = sentEmails[0].token;
    await postJson(auth, '/reset-password', {
      token,
      password: 'NewPassword456!',
    });

    // Old session should be revoked — refresh should fail
    const refreshReq = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
        'X-VTZ-Request': '1',
        Cookie: cookies,
      },
    });
    const refreshRes = await auth.handler(refreshReq);
    expect(refreshRes.status).toBe(401);
  });

  it('does not revoke sessions when revokeSessionsOnReset is false', async () => {
    auth.dispose();
    const result = createTestAuth({ revokeSessionsOnReset: false });
    auth = result.auth;
    sentEmails = result.sentEmails;

    // Sign up and get session cookies
    const signupRes = await signUp(auth, 'user@example.com');
    const cookies = signupRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    // Trigger password reset
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    const token = sentEmails[0].token;
    await postJson(auth, '/reset-password', {
      token,
      password: 'NewPassword456!',
    });

    // Old session should still work — refresh should succeed
    const refreshReq = new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
        'X-VTZ-Request': '1',
        Cookie: cookies,
      },
    });
    const refreshRes = await auth.handler(refreshReq);
    expect(refreshRes.status).toBe(200);
  });

  it('rejects expired reset token', async () => {
    auth.dispose();
    const result = createTestAuth({ tokenTtl: '1s' });
    auth = result.auth;
    sentEmails = result.sentEmails;

    await signUp(auth, 'user@example.com');
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    const token = sentEmails[0].token;

    // Wait for token to expire
    await new Promise((r) => setTimeout(r, 1100));

    const res = await postJson(auth, '/reset-password', {
      token,
      password: 'NewPassword456!',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects invalid reset token', async () => {
    const res = await postJson(auth, '/reset-password', {
      token: 'invalid-token',
      password: 'NewPassword456!',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TOKEN_INVALID');
  });

  it('validates password requirements on reset', async () => {
    await signUp(auth, 'user@example.com');
    await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    const token = sentEmails[0].token;

    const res = await postJson(auth, '/reset-password', {
      token,
      password: 'short',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('AUTH_VALIDATION_ERROR');
  });

  it('returns 400 for reset-password when password reset is not configured', async () => {
    auth.dispose();
    auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      jwtSecret: 'test-secret-for-password-reset-testing-1234567890',
      isProduction: false,
    });

    const res = await postJson(auth, '/reset-password', {
      token: 'some-token',
      password: 'NewPassword456!',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for forgot-password when password reset is not configured', async () => {
    auth.dispose();
    auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      jwtSecret: 'test-secret-for-password-reset-testing-1234567890',
      isProduction: false,
    });

    const res = await postJson(auth, '/forgot-password', { email: 'user@example.com' });
    expect(res.status).toBe(400);
  });
});
