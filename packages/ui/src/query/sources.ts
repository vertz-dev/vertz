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
 * const ticks = query<TickEvent>(
 *   (signal) => fromWebSocket<TickEvent>('wss://example/ticks', signal),
 *   { key: 'ticks' },
 * );
 * ```
 *
 * Note on errors: native WebSocket / EventSource `error` events do not carry
 * the underlying failure reason (it's a security limitation of the platform).
 * The helpers throw a generic `new Error('source error')`.  For diagnostic
 * detail, use the browser DevTools network panel or wire a richer protocol
 * (e.g., wrap your messages in `{ ok, data, error }` envelopes).
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
 * The producer/consumer rendezvous uses a queue + monotonic version counter
 * so messages arriving between consumer awaits are buffered in arrival order
 * AND the consumer never misses a wake-up (the version is bumped on every
 * push; the consumer awaits a Promise that resolves when version > seen).
 */
async function* iterateEventStream(
  source: {
    addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
    close(): void;
  },
  signal: AbortSignal,
): AsyncIterable<unknown> {
  const queue: QueueEntry[] = [];
  // Wake-up latch: every push increments `version`; the consumer awaits a
  // promise that resolves when `version` increases.  A push that happens
  // *before* the consumer installs the next waiter still wakes the next
  // await because `version` is already ahead of `seenVersion`.
  let version = 0;
  let seenVersion = 0;
  let pendingResolve: (() => void) | undefined;

  function bump(): void {
    version++;
    const r = pendingResolve;
    pendingResolve = undefined;
    r?.();
  }

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
    bump();
  };
  const onError = (e: unknown) => {
    queue.push({
      type: 'error',
      error: e instanceof Error ? e : new Error('source error'),
    });
    bump();
  };
  const onClose = () => {
    queue.push({ type: 'close' });
    bump();
  };

  source.addEventListener('message', onMessage);
  source.addEventListener('error', onError as (e: { data?: unknown }) => void);
  source.addEventListener('close', onClose as (e: { data?: unknown }) => void);

  const onAbort = () => {
    try {
      source.close();
    } catch {
      // ignore — already closed
    }
    queue.push({ type: 'close' });
    bump();
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
      // Wait for the next push.  If `version` already moved past what we
      // last consumed (a push raced our queue-drain check), loop without
      // sleeping so we drain the new entries immediately.
      if (version === seenVersion) {
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
        });
      }
      seenVersion = version;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    // Clear the queue so the generator's closure doesn't hold references
    // to undelivered message objects after the consumer abandoned us.
    queue.length = 0;
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
 * Type parameter `T` lets callers narrow the yield type:
 * `fromWebSocket<TickEvent>(url, signal)` returns `AsyncIterable<TickEvent>`.
 * Without a parameter, defaults to `unknown` so consumers must narrow at the
 * use site.
 *
 * - `data` is JSON-parsed when it's a string and parses successfully;
 *   non-JSON or non-string `data` is yielded as-is.
 * - `signal.abort()` closes the socket and ends iteration.
 * - Socket errors throw inside the generator (see module-level note about
 *   the native error event's lack of detail).
 */
export function fromWebSocket<T = unknown>(url: string, signal: AbortSignal): AsyncIterable<T> {
  const ws = new WebSocket(url);
  return iterateEventStream(
    ws as unknown as {
      addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
      close(): void;
    },
    signal,
  ) as AsyncIterable<T>;
}

/**
 * Yield messages from a Server-Sent Events stream as an AsyncIterable.
 *
 * Type parameter `T` lets callers narrow the yield type — see fromWebSocket.
 *
 * - `data` is JSON-parsed when it parses successfully; raw `data` otherwise.
 * - `signal.abort()` closes the EventSource and ends iteration.
 * - Source errors throw inside the generator.
 */
export function fromEventSource<T = unknown>(url: string, signal: AbortSignal): AsyncIterable<T> {
  const es = new EventSource(url);
  return iterateEventStream(
    es as unknown as {
      addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
      close(): void;
    },
    signal,
  ) as AsyncIterable<T>;
}
