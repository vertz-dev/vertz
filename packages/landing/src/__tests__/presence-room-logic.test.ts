import { describe, expect, it } from 'bun:test';

import {
  checkRateLimit,
  createRoom,
  handleJoin,
  handleLeave,
  handleMessage,
  parseClientMessage,
} from '../presence-room-logic';
import type { ServerMessage } from '../presence-types';
import { MAX_CONNECTIONS_PER_ROOM, MAX_MESSAGES_PER_SECOND } from '../presence-types';

// ── Helpers ─────────────────────────────────────────────────

function createTestHarness() {
  const sent: { connId: string; msg: ServerMessage }[] = [];
  const broadcasts: { msg: ServerMessage; exclude?: string }[] = [];

  const send = (connId: string, raw: string) => {
    sent.push({ connId, msg: JSON.parse(raw) });
  };
  const broadcast = (raw: string, exclude?: string) => {
    broadcasts.push({ msg: JSON.parse(raw), exclude });
  };

  return { sent, broadcasts, send, broadcast };
}

// ── parseClientMessage ──────────────────────────────────────

describe('parseClientMessage', () => {
  it('parses a valid interact message', () => {
    const msg = parseClientMessage('{"t":"interact"}');
    expect(msg).toEqual({ t: 'interact' });
  });

  it('parses a valid ping message', () => {
    const msg = parseClientMessage('{"t":"ping"}');
    expect(msg).toEqual({ t: 'ping' });
  });

  it('rejects invalid JSON', () => {
    expect(parseClientMessage('not json')).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(parseClientMessage('{"t":"move","x":50,"y":50}')).toBeNull();
  });

  it('rejects non-object messages', () => {
    expect(parseClientMessage('"hello"')).toBeNull();
    expect(parseClientMessage('42')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
  });

  it('rejects messages exceeding max size', () => {
    const huge = JSON.stringify({ t: 'interact', padding: 'x'.repeat(100) });
    expect(parseClientMessage(huge)).toBeNull();
  });

  it('rejects messages without t field', () => {
    expect(parseClientMessage('{"type":"interact"}')).toBeNull();
  });
});

// ── handleJoin ──────────────────────────────────────────────

describe('handleJoin', () => {
  it('sends state to the new connection', () => {
    const room = createRoom();
    const { sent, broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);

    expect(sent).toHaveLength(1);
    expect(sent[0].connId).toBe('conn-1');
    expect(sent[0].msg).toEqual({ t: 'state', count: 1 });
  });

  it('broadcasts join to existing connections', () => {
    const room = createRoom();
    const { sent, broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    handleJoin(room, 'conn-2', send, broadcast);

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].msg).toEqual({ t: 'join', count: 2 });
    expect(broadcasts[0].exclude).toBe('conn-2');
  });

  it('does not broadcast join when first connection', () => {
    const room = createRoom();
    const { broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);

    expect(broadcasts).toHaveLength(0);
  });

  it('returns false when room is full', () => {
    const room = createRoom();
    const { send, broadcast } = createTestHarness();

    for (let i = 0; i < MAX_CONNECTIONS_PER_ROOM; i++) {
      handleJoin(room, `conn-${i}`, send, broadcast);
    }

    const result = handleJoin(room, 'conn-overflow', send, broadcast);
    expect(result).toBe(false);
    expect(room.connections.size).toBe(MAX_CONNECTIONS_PER_ROOM);
  });

  it('tracks the connection count correctly', () => {
    const room = createRoom();
    const { sent, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    handleJoin(room, 'conn-2', send, broadcast);
    handleJoin(room, 'conn-3', send, broadcast);

    // Third connection should see count: 3
    expect(sent[2].msg).toEqual({ t: 'state', count: 3 });
  });
});

// ── handleLeave ─────────────────────────────────────────────

describe('handleLeave', () => {
  it('broadcasts leave with updated count', () => {
    const room = createRoom();
    const { broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    handleJoin(room, 'conn-2', send, broadcast);
    broadcasts.length = 0;

    handleLeave(room, 'conn-1', broadcast);

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].msg).toEqual({ t: 'leave', count: 1 });
  });

  it('does not broadcast when last connection leaves', () => {
    const room = createRoom();
    const { broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    broadcasts.length = 0;

    handleLeave(room, 'conn-1', broadcast);

    expect(broadcasts).toHaveLength(0);
  });

  it('removes the connection from the room', () => {
    const room = createRoom();
    const { send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    expect(room.connections.size).toBe(1);

    handleLeave(room, 'conn-1', broadcast);
    expect(room.connections.size).toBe(0);
  });

  it('cleans up rate limit tracking', () => {
    const room = createRoom();
    const { send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    expect(room.rateLimits.has('conn-1')).toBe(true);

    handleLeave(room, 'conn-1', broadcast);
    expect(room.rateLimits.has('conn-1')).toBe(false);
  });
});

// ── handleMessage ───────────────────────────────────────────

describe('handleMessage', () => {
  it('responds to ping with pong', () => {
    const room = createRoom();
    const { sent, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    sent.length = 0;

    handleMessage(room, 'conn-1', '{"t":"ping"}', send, broadcast);

    expect(sent).toHaveLength(1);
    expect(sent[0].msg).toEqual({ t: 'pong' });
  });

  it('broadcasts interact to all others', () => {
    const room = createRoom();
    const { broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    handleJoin(room, 'conn-2', send, broadcast);
    broadcasts.length = 0;

    handleMessage(room, 'conn-1', '{"t":"interact"}', send, broadcast);

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].msg).toEqual({ t: 'interact' });
    expect(broadcasts[0].exclude).toBe('conn-1');
  });

  it('does not broadcast interact back to sender', () => {
    const room = createRoom();
    const { sent, broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    sent.length = 0;

    handleMessage(room, 'conn-1', '{"t":"interact"}', send, broadcast);

    // No message sent back to the sender
    expect(sent).toHaveLength(0);
  });

  it('silently drops malformed messages', () => {
    const room = createRoom();
    const { sent, broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    sent.length = 0;

    handleMessage(room, 'conn-1', 'garbage', send, broadcast);

    expect(sent).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });

  it('silently drops unknown message types', () => {
    const room = createRoom();
    const { sent, broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    sent.length = 0;

    handleMessage(room, 'conn-1', '{"t":"move","x":50,"y":50}', send, broadcast);

    expect(sent).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });
});

// ── checkRateLimit ──────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows messages under the limit', () => {
    const room = createRoom();
    const { send, broadcast } = createTestHarness();
    handleJoin(room, 'conn-1', send, broadcast);

    for (let i = 0; i < MAX_MESSAGES_PER_SECOND; i++) {
      expect(checkRateLimit(room, 'conn-1')).toBe(true);
    }
  });

  it('blocks messages over the limit', () => {
    const room = createRoom();
    const { send, broadcast } = createTestHarness();
    handleJoin(room, 'conn-1', send, broadcast);

    for (let i = 0; i < MAX_MESSAGES_PER_SECOND; i++) {
      checkRateLimit(room, 'conn-1');
    }

    expect(checkRateLimit(room, 'conn-1')).toBe(false);
  });

  it('returns false for unknown connections', () => {
    const room = createRoom();
    expect(checkRateLimit(room, 'unknown')).toBe(false);
  });

  it('rate-limits interact messages in handleMessage', () => {
    const room = createRoom();
    const { broadcasts, send, broadcast } = createTestHarness();

    handleJoin(room, 'conn-1', send, broadcast);
    handleJoin(room, 'conn-2', send, broadcast);
    broadcasts.length = 0;

    // Send max allowed messages
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND; i++) {
      handleMessage(room, 'conn-1', '{"t":"interact"}', send, broadcast);
    }
    expect(broadcasts).toHaveLength(MAX_MESSAGES_PER_SECOND);

    // Next message should be dropped
    handleMessage(room, 'conn-1', '{"t":"interact"}', send, broadcast);
    expect(broadcasts).toHaveLength(MAX_MESSAGES_PER_SECOND);
  });
});
