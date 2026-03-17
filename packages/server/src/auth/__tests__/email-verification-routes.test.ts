import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthInstance } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

function createTestAuth(opts?: {
  onSend?: (user: { email: string }, token: string) => Promise<void>;
  tokenTtl?: string;
}) {
  const sentEmails: { email: string; token: string }[] = [];
  const onSend =
    opts?.onSend ??
    (async (user: { email: string }, token: string) => {
      sentEmails.push({ email: user.email, token });
    });

  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    emailPassword: { enabled: true },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
    emailVerification: {
      enabled: true,
      tokenTtl: opts?.tokenTtl ?? '24h',
      onSend,
    },
  });

  return { auth, sentEmails };
}

async function signUp(auth: AuthInstance, email: string, password = 'Password123!') {
  const req = new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
      'X-VTZ-Request': '1',
    },
    body: JSON.stringify({ email, password }),
  });
  return auth.handler(req);
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

describe('Email Verification Routes', () => {
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

  it('calls onSend with verification token on signup', async () => {
    const res = await signUp(auth, 'user@example.com');
    expect(res.status).toBe(201);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe('user@example.com');
    expect(sentEmails[0].token).toHaveLength(64); // 32 bytes hex
  });

  it('user has emailVerified: false in session after signup', async () => {
    const res = await signUp(auth, 'user@example.com');
    const data = await res.json();
    expect(data.user.emailVerified).toBe(false);
  });

  it('verifies email with valid token', async () => {
    await signUp(auth, 'user@example.com');
    const token = sentEmails[0].token;

    const res = await postJson(auth, '/verify-email', { token });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('marks user emailVerified: true after verification', async () => {
    const signupRes = await signUp(auth, 'user@example.com');
    const cookies = signupRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    const token = sentEmails[0].token;
    await postJson(auth, '/verify-email', { token });

    // Sign in again to get fresh session with emailVerified: true
    const signInRes = await postJson(auth, '/signin', {
      email: 'user@example.com',
      password: 'Password123!',
    });
    const data = await signInRes.json();
    expect(data.user.emailVerified).toBe(true);
  });

  it('rejects expired verification token', async () => {
    // Use numeric TTL of 1 millisecond for instant expiry
    const shortAuth = createTestAuth({ tokenTtl: '1s' });
    auth.dispose();
    auth = shortAuth.auth;
    sentEmails = shortAuth.sentEmails;

    await signUp(auth, 'user@example.com');
    const token = sentEmails[0].token;

    // Wait for token to expire (1 second + buffer)
    await new Promise((r) => setTimeout(r, 1100));

    const res = await postJson(auth, '/verify-email', { token });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects invalid verification token', async () => {
    const res = await postJson(auth, '/verify-email', { token: 'invalid-token-abc' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TOKEN_INVALID');
  });

  it('resends verification email for authenticated user', async () => {
    const signupRes = await signUp(auth, 'user@example.com');
    const cookies = signupRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    sentEmails.length = 0; // clear initial send

    const res = await postJson(auth, '/resend-verification', {}, cookies);
    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe('user@example.com');
  });

  it('rate limits resend-verification to 3 per hour', async () => {
    const signupRes = await signUp(auth, 'user@example.com');
    const cookies = signupRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    // First 3 should succeed
    for (let i = 0; i < 3; i++) {
      const res = await postJson(auth, '/resend-verification', {}, cookies);
      expect(res.status).toBe(200);
    }

    // 4th should be rate limited
    const res = await postJson(auth, '/resend-verification', {}, cookies);
    expect(res.status).toBe(429);
  });

  it('requires authentication for resend-verification', async () => {
    const res = await postJson(auth, '/resend-verification', {});
    expect(res.status).toBe(401);
  });

  it('does not send verification when emailVerification is disabled', async () => {
    auth.dispose();
    const disabledAuth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
    });
    auth = disabledAuth;

    const res = await signUp(auth, 'user@example.com');
    expect(res.status).toBe(201);
    expect(sentEmails).toHaveLength(0);
  });

  it('returns 400 for verify-email when email verification is not configured', async () => {
    auth.dispose();
    const disabledAuth = createAuth({
      session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
      isProduction: false,
    });
    auth = disabledAuth;

    const res = await postJson(auth, '/verify-email', { token: 'some-token' });
    expect(res.status).toBe(400);
  });
});
