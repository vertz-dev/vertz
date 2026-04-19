/**
 * AsyncIterable adapters for live data sources — feed `query()`'s stream
 * overload without writing the for-await + cancel + close boilerplate by hand.
 *
 * Each helper:
 *  - Yields parsed messages (JSON-parsed when possible; raw `data` otherwise).
 *  - Closes the underlying socket / source on `signal.abort()`.
 *  - Throws inside the generator on socket-level errors so the query's
 *    `.error` populates per the design doc.
 *
 * Usage:
 * ```ts
 * import { fromWebSocket, query } from '@vertz/ui';
 * const ticks = query((signal) => fromWebSocket('wss://example/ticks', signal), {
 *   key: 'ticks',
 * });
 * ```
 */

interface QueueEntry {
  type: 'message' | 'error' | 'close';
  data?: unknown;
  error?: unknown;
}

/**
 * Internal helper: turn an EventTarget-style source (WebSocket / EventSource
 * shape) into an AsyncIterable of parsed messages.
 *
 * The producer/consumer rendezvous uses a queue + Promise latch so messages
 * arriving faster than the consumer iterates are buffered in arrival order.
 */
async function* iterateEventStream(
  source: {
    addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
    close(): void;
  },
  messageEvent: 'message',
  signal: AbortSignal,
): AsyncIterable<unknown> {
  const queue: QueueEntry[] = [];
  let release: (() => void) | undefined;
  const onMessage = (e: { data?: unknown }) => {
    let parsed: unknown = e.data;
    if (typeof e.data === 'string') {
      try {
        parsed = JSON.parse(e.data);
      } catch {
        parsed = e.data;
      }
    }
    queue.push({ type: 'message', data: parsed });
    release?.();
  };
  const onError = (e: unknown) => {
    queue.push({
      type: 'error',
      error: e instanceof Error ? e : new Error('source error'),
    });
    release?.();
  };
  const onClose = () => {
    queue.push({ type: 'close' });
    release?.();
  };

  source.addEventListener(messageEvent, onMessage);
  source.addEventListener('error', onError as (e: { data?: unknown }) => void);
  source.addEventListener('close', onClose as (e: { data?: unknown }) => void);

  const onAbort = () => {
    try {
      source.close();
    } catch {
      // ignore — already closed
    }
    queue.push({ type: 'close' });
    release?.();
  };
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener('abort', onAbort);
  }

  try {
    while (true) {
      while (queue.length > 0) {
        const entry = queue.shift() as QueueEntry;
        if (entry.type === 'close') return;
        if (entry.type === 'error') throw entry.error;
        yield entry.data;
      }
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      release = undefined;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      source.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Yield messages from a WebSocket as an AsyncIterable.
 *
 * - `data` is JSON-parsed when it's a string and parses successfully;
 *   non-JSON or non-string `data` is yielded as-is.
 * - `signal.abort()` closes the socket and ends iteration.
 * - Socket errors throw inside the generator.
 */
export function fromWebSocket(url: string, signal: AbortSignal): AsyncIterable<unknown> {
  const ws = new WebSocket(url);
  return iterateEventStream(
    ws as unknown as {
      addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
      close(): void;
    },
    'message',
    signal,
  );
}

/**
 * Yield messages from a Server-Sent Events stream as an AsyncIterable.
 *
 * - `data` is JSON-parsed when it parses successfully; raw `data` otherwise.
 * - `signal.abort()` closes the EventSource and ends iteration.
 * - Source errors throw inside the generator.
 */
export function fromEventSource(url: string, signal: AbortSignal): AsyncIterable<unknown> {
  const es = new EventSource(url);
  return iterateEventStream(
    es as unknown as {
      addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
      close(): void;
    },
    'message',
    signal,
  );
}
