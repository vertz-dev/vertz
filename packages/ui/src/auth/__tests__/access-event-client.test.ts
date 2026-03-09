import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createAccessEventClient } from '../access-event-client';

// ============================================================================
// WebSocket Mock
// ============================================================================

interface MockWebSocketInstance {
  url: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  close: () => void;
}

let mockWebSockets: MockWebSocketInstance[];
let OriginalWebSocket: typeof globalThis.WebSocket | undefined;

function createMockWebSocketClass() {
  return class MockWebSocket {
    url: string;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    readyState = 0; // CONNECTING

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url: string) {
      this.url = url;
      mockWebSockets.push(this as unknown as MockWebSocketInstance);
    }

    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose({});
    }

    send(_data: string) {}
  };
}

// ============================================================================
// Timer Mocking
// ============================================================================

let timers: { callback: () => void; delay: number; id: number }[];
let nextTimerId: number;
let originalSetTimeout: typeof globalThis.setTimeout;
let originalClearTimeout: typeof globalThis.clearTimeout;

// ============================================================================
// Tests
// ============================================================================

describe('createAccessEventClient', () => {
  beforeEach(() => {
    mockWebSockets = [];
    OriginalWebSocket = globalThis.WebSocket;
    // @ts-expect-error - assigning mock class to WebSocket
    globalThis.WebSocket = createMockWebSocketClass();

    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    timers = [];
    nextTimerId = 1;

    // @ts-expect-error - mock setTimeout
    globalThis.setTimeout = (cb: () => void, delay: number) => {
      const id = nextTimerId++;
      timers.push({ callback: cb, delay, id });
      return id;
    };
    globalThis.clearTimeout = (id: number) => {
      timers = timers.filter((t) => t.id !== id);
    };
  });

  afterEach(() => {
    if (OriginalWebSocket) {
      globalThis.WebSocket = OriginalWebSocket;
    }
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  it('returns client with all required methods', () => {
    const client = createAccessEventClient({
      onEvent: () => {},
      onReconnect: () => {},
    });

    expect(typeof client.connect).toBe('function');
    expect(typeof client.disconnect).toBe('function');
    expect(typeof client.dispose).toBe('function');
  });

  it('connect() creates WebSocket connection', () => {
    const client = createAccessEventClient({
      url: 'ws://localhost:3000/api/auth/access-events',
      onEvent: () => {},
      onReconnect: () => {},
    });

    client.connect();
    expect(mockWebSockets.length).toBe(1);
    expect(mockWebSockets[0].url).toBe('ws://localhost:3000/api/auth/access-events');
  });

  it('onEvent called with parsed access:flag_toggled', () => {
    const onEvent = mock(() => {});
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent,
      onReconnect: () => {},
    });

    client.connect();
    const ws = mockWebSockets[0];

    // Simulate open
    ws.readyState = 1;
    ws.onopen?.({});

    // Simulate message
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'access:flag_toggled',
        flag: 'export-v2',
        enabled: true,
      }),
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'access:flag_toggled',
      flag: 'export-v2',
      enabled: true,
    });
  });

  it('onEvent called with parsed access:limit_updated', () => {
    const onEvent = mock(() => {});
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent,
      onReconnect: () => {},
    });

    client.connect();
    const ws = mockWebSockets[0];
    ws.readyState = 1;
    ws.onopen?.({});

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'access:limit_updated',
        entitlement: 'project:create',
        consumed: 43,
        remaining: 57,
        max: 100,
      }),
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'access:limit_updated',
      entitlement: 'project:create',
      consumed: 43,
      remaining: 57,
      max: 100,
    });
  });

  it('reconnects with exponential backoff (1s, 2s, 4s)', () => {
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent: () => {},
      onReconnect: () => {},
    });

    client.connect();
    const ws = mockWebSockets[0];

    // Simulate disconnect
    ws.readyState = 3;
    ws.onclose?.({});

    // Should schedule reconnect with ~1s delay (±25% jitter)
    const timer1 = timers[timers.length - 1];
    expect(timer1.delay).toBeGreaterThanOrEqual(750);
    expect(timer1.delay).toBeLessThanOrEqual(1250);

    // Trigger reconnect
    timer1.callback();
    const ws2 = mockWebSockets[1];

    // Second disconnect
    ws2.readyState = 3;
    ws2.onclose?.({});

    // Should schedule with ~2s delay
    const timer2 = timers[timers.length - 1];
    expect(timer2.delay).toBeGreaterThanOrEqual(1500);
    expect(timer2.delay).toBeLessThanOrEqual(2500);
  });

  it('backoff caps at 30s', () => {
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent: () => {},
      onReconnect: () => {},
    });

    client.connect();

    // Simulate many disconnects to reach cap
    for (let i = 0; i < 10; i++) {
      const ws = mockWebSockets[mockWebSockets.length - 1];
      ws.readyState = 3;
      ws.onclose?.({});
      const lastTimer = timers[timers.length - 1];
      if (lastTimer) lastTimer.callback();
    }

    // Last timer should be capped at 30s (± jitter)
    const ws = mockWebSockets[mockWebSockets.length - 1];
    ws.readyState = 3;
    ws.onclose?.({});

    const lastTimer = timers[timers.length - 1];
    expect(lastTimer.delay).toBeLessThanOrEqual(37_500); // 30s + 25%
    expect(lastTimer.delay).toBeGreaterThanOrEqual(22_500); // 30s - 25%
  });

  it('backoff resets on successful connection', () => {
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent: () => {},
      onReconnect: () => {},
    });

    client.connect();
    const ws1 = mockWebSockets[0];

    // Disconnect triggers backoff increment
    ws1.readyState = 3;
    ws1.onclose?.({});
    timers[timers.length - 1].callback(); // Reconnect

    const ws2 = mockWebSockets[1];
    // Successful connection
    ws2.readyState = 1;
    ws2.onopen?.({});

    // Disconnect again — should reset to 1s
    ws2.readyState = 3;
    ws2.onclose?.({});

    const lastTimer = timers[timers.length - 1];
    expect(lastTimer.delay).toBeGreaterThanOrEqual(750);
    expect(lastTimer.delay).toBeLessThanOrEqual(1250);
  });

  it('onReconnect called after reconnection', () => {
    const onReconnect = mock(() => {});
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent: () => {},
      onReconnect,
    });

    client.connect();
    const ws1 = mockWebSockets[0];
    ws1.readyState = 1;
    ws1.onopen?.({});

    // First open should NOT call onReconnect (it's the initial connection)
    expect(onReconnect).toHaveBeenCalledTimes(0);

    // Disconnect
    ws1.readyState = 3;
    ws1.onclose?.({});
    timers[0].callback(); // Reconnect

    const ws2 = mockWebSockets[1];
    ws2.readyState = 1;
    ws2.onopen?.({});

    // Second open IS a reconnection
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnect() closes connection and stops reconnection', () => {
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent: () => {},
      onReconnect: () => {},
    });

    client.connect();
    const ws = mockWebSockets[0];
    ws.readyState = 1;
    ws.onopen?.({});

    client.disconnect();

    // Should not schedule reconnect after manual disconnect
    expect(timers.length).toBe(0);
  });

  it('dispose() cleans up all listeners and timers', () => {
    const client = createAccessEventClient({
      url: 'ws://localhost/api/auth/access-events',
      onEvent: () => {},
      onReconnect: () => {},
    });

    client.connect();
    const ws = mockWebSockets[0];
    ws.readyState = 1;
    ws.onopen?.({});

    client.dispose();

    // Should be cleaned up
    expect(timers.length).toBe(0);
  });
});
