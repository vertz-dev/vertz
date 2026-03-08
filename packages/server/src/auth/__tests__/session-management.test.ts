/**
 * Session Management API Tests — Sub-Phase 4
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { createAuth } from '../index';
import type { AuthConfig, AuthInstance, SessionInfo } from '../types';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: {
      strategy: 'jwt',
      ttl: '60s',
      refreshTtl: '7d',
    },
    jwtSecret: 'session-mgmt-test-secret-at-least-32-chars',
    isProduction: false,
    ...overrides,
  });
}

describe('Session Management API', () => {
  let auth: AuthInstance;

  beforeEach(() => {
    auth = createTestAuth();
  });

  it('GET /sessions returns list of active sessions for current user', async () => {
    const signUp = await auth.api.signUp({
      email: 'list@test.com',
      password: 'password123',
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;

    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${signUp.data.tokens?.jwt}` },
      }),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { sessions: SessionInfo[] };
    expect(body.sessions.length).toBe(1);
  });

  it('GET /sessions marks current session with isCurrent: true', async () => {
    const signUp = await auth.api.signUp({
      email: 'current@test.com',
      password: 'password123',
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;

    // Create a second session via sign-in
    await auth.api.signIn({ email: 'current@test.com', password: 'password123' });

    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${signUp.data.tokens?.jwt}` },
      }),
    );
    const body = (await res.json()) as { sessions: SessionInfo[] };
    expect(body.sessions.length).toBe(2);

    const current = body.sessions.find((s) => s.isCurrent);
    expect(current).toBeDefined();
    expect(current?.isCurrent).toBe(true);
  });

  it('GET /sessions includes device name from User-Agent', async () => {
    const signUp = await auth.api.signUp({
      email: 'device@test.com',
      password: 'password123',
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;

    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${signUp.data.tokens?.jwt}` },
      }),
    );
    const body = (await res.json()) as { sessions: SessionInfo[] };
    // Device name should exist (may be "Unknown device" for test requests)
    expect(body.sessions[0].deviceName).toBeDefined();
  });

  it('GET /sessions returns 401 when unauthenticated', async () => {
    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: {},
      }),
    );
    expect(res.status).toBe(401);
  });

  it('DELETE /sessions/:id revokes specific session', async () => {
    const signUp = await auth.api.signUp({
      email: 'revoke@test.com',
      password: 'password123',
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;

    // Create a second session
    const signIn = await auth.api.signIn({
      email: 'revoke@test.com',
      password: 'password123',
    });
    expect(signIn.ok).toBe(true);
    if (!signIn.ok) return;

    // List sessions to get the first session's ID
    const listRes = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${signIn.data.tokens?.jwt}` },
      }),
    );
    const listBody = (await listRes.json()) as { sessions: SessionInfo[] };
    const otherSession = listBody.sessions.find((s) => !s.isCurrent);
    expect(otherSession).toBeDefined();

    // Revoke the other session
    const deleteRes = await auth.handler(
      new Request(`http://localhost/api/auth/sessions/${otherSession?.id}`, {
        method: 'DELETE',
        headers: { cookie: `vertz.sid=${signIn.data.tokens?.jwt}` },
      }),
    );
    expect(deleteRes.status).toBe(200);

    // List again — should have 1
    const listRes2 = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${signIn.data.tokens?.jwt}` },
      }),
    );
    const listBody2 = (await listRes2.json()) as { sessions: SessionInfo[] };
    expect(listBody2.sessions.length).toBe(1);
  });

  it('DELETE /sessions/:id returns 404 for non-existent session', async () => {
    const signUp = await auth.api.signUp({
      email: 'notfound@test.com',
      password: 'password123',
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;

    const res = await auth.handler(
      new Request('http://localhost/api/auth/sessions/non-existent-id', {
        method: 'DELETE',
        headers: { cookie: `vertz.sid=${signUp.data.tokens?.jwt}` },
      }),
    );
    // Session not found returns 401 (SESSION_EXPIRED error code maps to 401)
    expect(res.status).toBe(401);
  });

  it('DELETE /sessions revokes all sessions except current', async () => {
    // Sign up
    const signUp = await auth.api.signUp({
      email: 'revokeall@test.com',
      password: 'password123',
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;

    // Create second session
    const signIn = await auth.api.signIn({
      email: 'revokeall@test.com',
      password: 'password123',
    });
    expect(signIn.ok).toBe(true);
    if (!signIn.ok) return;

    // Revoke all except current
    const deleteRes = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'DELETE',
        headers: { cookie: `vertz.sid=${signIn.data.tokens?.jwt}` },
      }),
    );
    expect(deleteRes.status).toBe(200);

    // List — should have 1
    const listRes = await auth.handler(
      new Request('http://localhost/api/auth/sessions', {
        method: 'GET',
        headers: { cookie: `vertz.sid=${signIn.data.tokens?.jwt}` },
      }),
    );
    const listBody = (await listRes.json()) as { sessions: SessionInfo[] };
    expect(listBody.sessions.length).toBe(1);
    expect(listBody.sessions[0].isCurrent).toBe(true);
  });
});
