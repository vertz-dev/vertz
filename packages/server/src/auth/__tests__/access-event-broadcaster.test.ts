import { describe, expect, it } from 'bun:test';
import * as jose from 'jose';
import type { AccessWsData } from '../access-event-broadcaster';
import { createAccessEventBroadcaster } from '../access-event-broadcaster';

function createMockServer() {
  const upgraded: Array<{ data: AccessWsData }> = [];
  return {
    upgrade(request: Request, options?: { data?: AccessWsData }) {
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
});
