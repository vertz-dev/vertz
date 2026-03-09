import { describe, expect, it } from 'bun:test';
import * as jose from 'jose';
import type { AccessWsData } from '../access-event-broadcaster';
import { createAccessEventBroadcaster } from '../access-event-broadcaster';

function createMockServer() {
  const upgraded: Array<{ data: AccessWsData }> = [];
  return {
    upgrade(_request: Request, options?: { data?: AccessWsData }) {
      if (options?.data) upgraded.push({ data: options.data });
      return true;
    },
    upgraded,
  };
}

interface MockWsConfig {
  data: AccessWsData;
}

function createMockWs(config: MockWsConfig) {
  const sentMessages: string[] = [];
  return {
    data: config.data,
    send(msg: string) {
      sentMessages.push(msg);
    },
    close() {},
    ping() {},
    sentMessages,
  };
}

const TEST_SECRET = 'test-secret-for-broadcaster-tests-minimum-32chars';

describe('createAccessEventBroadcaster', () => {
  it('returns broadcaster with all required methods', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    expect(typeof broadcaster.handleUpgrade).toBe('function');
    expect(typeof broadcaster.broadcastFlagToggle).toBe('function');
    expect(typeof broadcaster.broadcastLimitUpdate).toBe('function');
    expect(typeof broadcaster.broadcastRoleChange).toBe('function');
    expect(typeof broadcaster.broadcastPlanChange).toBe('function');
    expect(typeof broadcaster.getConnectionCount).toBe('number');
    expect(broadcaster.websocket).toBeDefined();
    expect(typeof broadcaster.websocket.open).toBe('function');
    expect(typeof broadcaster.websocket.message).toBe('function');
    expect(typeof broadcaster.websocket.close).toBe('function');
  });

  it('handleUpgrade returns false for non-matching path', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });
    const server = createMockServer();
    const request = new Request('http://localhost/api/other');

    const result = await broadcaster.handleUpgrade(request, server);
    expect(result).toBe(false);
    expect(server.upgraded.length).toBe(0);
  });

  it('handleUpgrade returns false for missing cookie', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });
    const server = createMockServer();
    const request = new Request('http://localhost/api/auth/access-events');

    const result = await broadcaster.handleUpgrade(request, server);
    expect(result).toBe(false);
  });

  it('handleUpgrade calls server.upgrade with correct data for valid JWT', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });
    const server = createMockServer();

    // Create JWT with jti and sid claims (required by verifyJWT)
    const jwt = await new jose.SignJWT({
      sub: 'user-1',
      email: 'test@test.com',
      role: 'user',
      jti: 'token-1',
      sid: 'session-1',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(TEST_SECRET));

    const request = new Request('http://localhost/api/auth/access-events', {
      headers: { cookie: `vertz.sid=${jwt}` },
    });

    const result = await broadcaster.handleUpgrade(request, server);
    expect(result).toBe(true);
    expect(server.upgraded.length).toBe(1);
    expect(server.upgraded[0].data.userId).toBe('user-1');
  });

  it('broadcastFlagToggle sends to all connections with matching orgId', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws1 = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    const ws2 = createMockWs({ data: { userId: 'user-2', orgId: 'org-1' } });
    const ws3 = createMockWs({ data: { userId: 'user-3', orgId: 'org-2' } });

    // Simulate connections
    broadcaster.websocket.open(ws1);
    broadcaster.websocket.open(ws2);
    broadcaster.websocket.open(ws3);

    broadcaster.broadcastFlagToggle('org-1', 'export-v2', true);

    expect(ws1.sentMessages.length).toBe(1);
    const parsed1 = JSON.parse(ws1.sentMessages[0]);
    expect(parsed1.type).toBe('access:flag_toggled');
    expect(parsed1.flag).toBe('export-v2');
    expect(parsed1.enabled).toBe(true);

    expect(ws2.sentMessages.length).toBe(1);
    expect(ws3.sentMessages.length).toBe(0); // different org
  });

  it('broadcastLimitUpdate sends correct payload', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    broadcaster.websocket.open(ws);

    broadcaster.broadcastLimitUpdate('org-1', 'project:create', 43, 57, 100);

    expect(ws.sentMessages.length).toBe(1);
    const parsed = JSON.parse(ws.sentMessages[0]);
    expect(parsed.type).toBe('access:limit_updated');
    expect(parsed.entitlement).toBe('project:create');
    expect(parsed.consumed).toBe(43);
    expect(parsed.remaining).toBe(57);
    expect(parsed.max).toBe(100);
  });

  it('broadcastRoleChange sends to connections with matching userId', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws1 = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    const ws2 = createMockWs({ data: { userId: 'user-1', orgId: 'org-2' } });
    const ws3 = createMockWs({ data: { userId: 'user-2', orgId: 'org-1' } });

    broadcaster.websocket.open(ws1);
    broadcaster.websocket.open(ws2);
    broadcaster.websocket.open(ws3);

    broadcaster.broadcastRoleChange('user-1');

    expect(ws1.sentMessages.length).toBe(1);
    expect(ws2.sentMessages.length).toBe(1);
    expect(ws3.sentMessages.length).toBe(0);

    const parsed = JSON.parse(ws1.sentMessages[0]);
    expect(parsed.type).toBe('access:role_changed');
    expect(parsed.userId).toBe('user-1');
  });

  it('broadcastPlanChange sends to all connections for affected org', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws1 = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    const ws2 = createMockWs({ data: { userId: 'user-2', orgId: 'org-2' } });

    broadcaster.websocket.open(ws1);
    broadcaster.websocket.open(ws2);

    broadcaster.broadcastPlanChange('org-1');

    expect(ws1.sentMessages.length).toBe(1);
    expect(ws2.sentMessages.length).toBe(0);

    const parsed = JSON.parse(ws1.sentMessages[0]);
    expect(parsed.type).toBe('access:plan_changed');
    expect(parsed.orgId).toBe('org-1');
  });

  it('getConnectionCount returns correct count', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    expect(broadcaster.getConnectionCount).toBe(0);

    const ws1 = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    const ws2 = createMockWs({ data: { userId: 'user-2', orgId: 'org-1' } });

    broadcaster.websocket.open(ws1);
    expect(broadcaster.getConnectionCount).toBe(1);

    broadcaster.websocket.open(ws2);
    expect(broadcaster.getConnectionCount).toBe(2);
  });

  it('connection cleanup on close', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws1 = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    const ws2 = createMockWs({ data: { userId: 'user-2', orgId: 'org-1' } });

    broadcaster.websocket.open(ws1);
    broadcaster.websocket.open(ws2);
    expect(broadcaster.getConnectionCount).toBe(2);

    broadcaster.websocket.close(ws1);
    expect(broadcaster.getConnectionCount).toBe(1);

    // Broadcast should only reach ws2 now
    broadcaster.broadcastFlagToggle('org-1', 'test', true);
    expect(ws1.sentMessages.length).toBe(0);
    expect(ws2.sentMessages.length).toBe(1);
  });

  it('websocket.message ignores pong responses silently', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    broadcaster.websocket.open(ws);

    // Sending 'pong' should not throw or produce side effects
    broadcaster.websocket.message(ws, 'pong');
    expect(ws.sentMessages.length).toBe(0);
  });

  it('websocket.message ignores non-pong messages', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    broadcaster.websocket.open(ws);

    // Arbitrary messages should be ignored
    broadcaster.websocket.message(ws, 'hello');
    broadcaster.websocket.message(ws, Buffer.from('binary'));
    expect(ws.sentMessages.length).toBe(0);
  });

  it('handleUpgrade returns false for invalid JWT', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });
    const server = createMockServer();

    const request = new Request('http://localhost/api/auth/access-events', {
      headers: { cookie: 'vertz.sid=invalid-jwt-token' },
    });

    const result = await broadcaster.handleUpgrade(request, server);
    expect(result).toBe(false);
    expect(server.upgraded.length).toBe(0);
  });

  it('handleUpgrade extracts cookie from multiple cookies', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });
    const server = createMockServer();

    const jwt = await new jose.SignJWT({
      sub: 'user-2',
      email: 'test2@test.com',
      role: 'user',
      jti: 'token-2',
      sid: 'session-2',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(TEST_SECRET));

    const request = new Request('http://localhost/api/auth/access-events', {
      headers: { cookie: `other=value; vertz.sid=${jwt}; another=test` },
    });

    const result = await broadcaster.handleUpgrade(request, server);
    expect(result).toBe(true);
    expect(server.upgraded[0].data.userId).toBe('user-2');
  });

  it('handleUpgrade with custom path', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
      path: '/custom/ws',
    });
    const server = createMockServer();

    // Request to default path should fail
    const req1 = new Request('http://localhost/api/auth/access-events');
    expect(await broadcaster.handleUpgrade(req1, server)).toBe(false);

    // Request to custom path with valid JWT should succeed
    const jwt = await new jose.SignJWT({
      sub: 'user-1',
      email: 'test@test.com',
      role: 'user',
      jti: 'token-1',
      sid: 'session-1',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(TEST_SECRET));

    const req2 = new Request('http://localhost/custom/ws', {
      headers: { cookie: `vertz.sid=${jwt}` },
    });
    expect(await broadcaster.handleUpgrade(req2, server)).toBe(true);
  });

  it('handleUpgrade with custom cookie name', async () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
      cookieName: 'my-session',
    });
    const server = createMockServer();

    const jwt = await new jose.SignJWT({
      sub: 'user-1',
      email: 'test@test.com',
      role: 'user',
      jti: 'token-1',
      sid: 'session-1',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(TEST_SECRET));

    // Wrong cookie name
    const req1 = new Request('http://localhost/api/auth/access-events', {
      headers: { cookie: `vertz.sid=${jwt}` },
    });
    expect(await broadcaster.handleUpgrade(req1, server)).toBe(false);

    // Correct cookie name
    const req2 = new Request('http://localhost/api/auth/access-events', {
      headers: { cookie: `my-session=${jwt}` },
    });
    expect(await broadcaster.handleUpgrade(req2, server)).toBe(true);
  });

  it('broadcastToOrg is no-op when no connections for org', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    // No connections — should not throw
    broadcaster.broadcastFlagToggle('nonexistent-org', 'flag', true);
  });

  it('broadcastToUser is no-op when no connections for user', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    // No connections — should not throw
    broadcaster.broadcastRoleChange('nonexistent-user');
  });

  it('closing last connection for org removes org entry', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: TEST_SECRET,
    });

    const ws = createMockWs({ data: { userId: 'user-1', orgId: 'org-1' } });
    broadcaster.websocket.open(ws);
    broadcaster.websocket.close(ws);

    // After close, broadcasting to org-1 should be no-op (no connections)
    const ws2 = createMockWs({ data: { userId: 'user-2', orgId: 'org-2' } });
    broadcaster.websocket.open(ws2);
    broadcaster.broadcastFlagToggle('org-1', 'flag', true);
    expect(ws2.sentMessages.length).toBe(0);
  });
});
