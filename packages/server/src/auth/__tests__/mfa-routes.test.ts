/**
 * MFA Routes Tests — Sub-Phase 3
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import { generateTotpCode } from '../totp';
import type { AuthConfig, AuthInstance } from '../types';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    jwtSecret: 'mfa-test-secret-at-least-32-characters-long',
    isProduction: false,
    mfa: { enabled: true, issuer: 'TestApp' },
    oauthEncryptionKey: 'mfa-encryption-key-at-least-32-chars-long!!',
    ...overrides,
  });
}

function parseCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of response.headers.getSetCookie()) {
    const [nameValue] = header.split(';');
    const [name, ...rest] = nameValue.split('=');
    cookies[name.trim()] = rest.join('=');
  }
  return cookies;
}

async function signUpAndGetSession(auth: AuthInstance, email = 'mfa@test.com'): Promise<string> {
  const result = await auth.api.signUp({ email, password: 'password123' });
  if (!result.ok || !result.data.tokens) throw new Error('Sign up failed');
  return `vertz.sid=${result.data.tokens.jwt}`;
}

describe('MFA Routes', { timeout: 60_000 }, () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  // ===== POST /mfa/setup =====

  it('POST /mfa/setup returns secret and URI when authenticated', async () => {
    const cookie = await signUpAndGetSession(auth);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secret: string; uri: string };
    expect(body.secret).toBeDefined();
    expect(body.uri).toContain('otpauth://totp/');
    expect(body.uri).toContain('TestApp');
  });

  it('POST /mfa/setup returns 401 when not authenticated', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('POST /mfa/setup returns MFA_ALREADY_ENABLED when MFA is on', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup MFA
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };

    // Verify setup to enable MFA
    const code = await generateTotpCode(secret);
    await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    // Try to setup again — should fail
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MFA_ALREADY_ENABLED');
  });

  // ===== POST /mfa/verify-setup =====

  it('POST /mfa/verify-setup enables MFA with valid TOTP code', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };

    // Verify
    const code = await generateTotpCode(secret);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('POST /mfa/verify-setup returns backup codes on success', async () => {
    const cookie = await signUpAndGetSession(auth);

    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };

    const code = await generateTotpCode(secret);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );
    const body = (await res.json()) as { backupCodes: string[] };
    expect(body.backupCodes).toHaveLength(10);
    expect(body.backupCodes[0]).toHaveLength(8);
  });

  it('POST /mfa/verify-setup rejects invalid code', async () => {
    const cookie = await signUpAndGetSession(auth);

    await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '000000' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MFA_INVALID_CODE');
  });

  // ===== POST /mfa/disable =====

  it('POST /mfa/disable disables MFA with correct password', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup + verify MFA
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };
    const code = await generateTotpCode(secret);
    await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    // Disable MFA
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/disable', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('POST /mfa/disable rejects wrong password', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup + verify MFA
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };
    const code = await generateTotpCode(secret);
    await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/disable', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrongpassword' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  // ===== POST /mfa/backup-codes =====

  it('POST /mfa/backup-codes regenerates codes with correct password', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup + verify MFA
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };
    const code = await generateTotpCode(secret);
    await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/backup-codes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { backupCodes: string[] };
    expect(body.backupCodes).toHaveLength(10);
  });

  it('POST /mfa/backup-codes rejects wrong password', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup + verify MFA
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };
    const code = await generateTotpCode(secret);
    await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/backup-codes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  // ===== GET /mfa/status =====

  it('GET /mfa/status returns enabled=false when MFA off', async () => {
    const cookie = await signUpAndGetSession(auth);
    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/status', {
        method: 'GET',
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      enabled: boolean;
      hasBackupCodes: boolean;
      backupCodesRemaining: number;
    };
    expect(body.enabled).toBe(false);
    expect(body.hasBackupCodes).toBe(false);
    expect(body.backupCodesRemaining).toBe(0);
  });

  it('GET /mfa/status returns enabled=true when MFA on with backup code count', async () => {
    const cookie = await signUpAndGetSession(auth);

    // Setup + verify MFA
    const setupRes = await auth.handler(
      new Request('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    const { secret } = (await setupRes.json()) as { secret: string };
    const code = await generateTotpCode(secret);
    await auth.handler(
      new Request('http://localhost/api/auth/mfa/verify-setup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );

    const res = await auth.handler(
      new Request('http://localhost/api/auth/mfa/status', {
        method: 'GET',
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      enabled: boolean;
      hasBackupCodes: boolean;
      backupCodesRemaining: number;
    };
    expect(body.enabled).toBe(true);
    expect(body.hasBackupCodes).toBe(true);
    expect(body.backupCodesRemaining).toBe(10);
  });
});
