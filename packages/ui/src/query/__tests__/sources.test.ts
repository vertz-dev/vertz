import { afterEach, beforeEach, describe, expect, test } from '@vertz/test';
import { fromEventSource, fromWebSocket } from '../sources';

// ─── Minimal WebSocket / EventSource mocks ───────────────────────────

interface FakeListener {
  type: string;
  fn: (e: { data?: unknown }) => void;
}

class FakeSource {
  readonly url: string;
  closed = false;
  private listeners: FakeListener[] = [];
  constructor(url: string) {
    this.url = url;
    lastFakeWS = this;
  }
  addEventListener(type: string, fn: (e: { data?: unknown }) => void): void {
    this.listeners.push({ type, fn });
  }
  emit(type: string, data?: unknown): void {
    for (const l of this.listeners) if (l.type === type) l.fn({ data });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

let lastFakeWS: FakeSource | undefined;

const g = globalThis as Record<string, unknown>;
let originalWS: unknown;
let originalES: unknown;

beforeEach(() => {
  lastFakeWS = undefined;
  originalWS = g.WebSocket;
  originalES = g.EventSource;
  g.WebSocket = FakeSource;
  g.EventSource = FakeSource;
});
afterEach(() => {
  g.WebSocket = originalWS;
  g.EventSource = originalES;
});

describe('fromWebSocket', () => {
  describe('Given a WebSocket source that emits 3 JSON messages', () => {
    describe('When the iterable is consumed', () => {
      test('then it yields all 3 in arrival order, parsed', async () => {
        const controller = new AbortController();
        const iter = fromWebSocket('wss://test/x', controller.signal);
        queueMicrotask(() => {
          lastFakeWS?.emit('message', JSON.stringify({ id: '1' }));
          lastFakeWS?.emit('message', JSON.stringify({ id: '2' }));
          lastFakeWS?.emit('message', JSON.stringify({ id: '3' }));
        });
        const items: unknown[] = [];
        for await (const item of iter) {
          items.push(item);
          if (items.length >= 3) controller.abort();
        }
        expect(items).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
      });
    });
  });

  describe('Given a WebSocket source that emits a non-JSON message', () => {
    describe('When the iterable is consumed', () => {
      test('then the raw string is yielded', async () => {
        const controller = new AbortController();
        const iter = fromWebSocket('wss://test/x', controller.signal);
        queueMicrotask(() => {
          lastFakeWS?.emit('message', 'plain text not json');
        });
        const items: unknown[] = [];
        for await (const item of iter) {
          items.push(item);
          controller.abort();
        }
        expect(items).toEqual(['plain text not json']);
      });
    });
  });

  describe('Given the AbortSignal fires after the first message', () => {
    describe('When the iterable is being consumed', () => {
      test('then the socket closes and iteration ends without further yields', async () => {
        const controller = new AbortController();
        const iter = fromWebSocket('wss://test/x', controller.signal);
        queueMicrotask(() => {
          lastFakeWS?.emit('message', JSON.stringify({ id: '1' }));
        });
        const items: unknown[] = [];
        for await (const item of iter) {
          items.push(item);
          controller.abort();
        }
        expect(items).toEqual([{ id: '1' }]);
        expect(lastFakeWS?.closed).toBe(true);
      });
    });
  });

  describe('Given the WebSocket emits an error event', () => {
    describe('When the iterable is consumed', () => {
      test('then iteration throws an Error (native error events carry no detail)', async () => {
        const controller = new AbortController();
        const iter = fromWebSocket('wss://test/x', controller.signal);
        queueMicrotask(() => {
          // Mirror the native shape: error event has no useful payload.
          lastFakeWS?.emit('error');
        });
        let caught: unknown;
        try {
          for await (const item of iter) {
            void item;
          }
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(Error);
      });
    });
  });
});

describe('fromEventSource', () => {
  describe('Given an EventSource that emits parsed messages and closes', () => {
    describe('When the iterable is consumed', () => {
      test('then yields parsed values and ends on close', async () => {
        const controller = new AbortController();
        const iter = fromEventSource('https://test/sse', controller.signal);
        queueMicrotask(() => {
          lastFakeWS?.emit('message', JSON.stringify({ tick: 1 }));
          lastFakeWS?.emit('message', JSON.stringify({ tick: 2 }));
          lastFakeWS?.close();
        });
        const items: unknown[] = [];
        for await (const item of iter) {
          items.push(item);
        }
        expect(items).toEqual([{ tick: 1 }, { tick: 2 }]);
      });
    });
  });
});
