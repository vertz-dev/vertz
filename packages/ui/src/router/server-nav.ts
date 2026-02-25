/**
 * Client-side server navigation pre-fetch.
 *
 * When the user navigates client-side, this module fetches query data
 * from the dev server via SSE and injects it into the existing SSR
 * hydration bus (__VERTZ_SSR_DATA__ + vertz:ssr-data events).
 *
 * This allows queries that mount during the new page render to pick up
 * pre-fetched data from the bus instead of starting a client-side fetch,
 * eliminating loading flashes.
 */

interface SSEEvent {
  type: string;
  data: string;
}

/**
 * Parse Server-Sent Events from a text buffer.
 *
 * Returns parsed complete events and any remaining incomplete text.
 * Complete events are delimited by double newlines (\n\n).
 */
export function parseSSE(buffer: string): { events: SSEEvent[]; remaining: string } {
  const events: SSEEvent[] = [];
  const blocks = buffer.split('\n\n');

  // Last element is either empty (if buffer ends with \n\n) or an incomplete block
  const remaining = blocks.pop() ?? '';

  for (const block of blocks) {
    if (block.trim() === '') continue;

    let type = '';
    let data = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        type = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (type) {
      events.push({ type, data });
    }
  }

  return { events, remaining };
}

/**
 * Re-create the SSR data bus globals.
 *
 * After the initial SSR hydration, cleanupSSRData() deletes these globals.
 * We re-create them so hydrateQueryFromSSR() in query.ts can find pre-fetched
 * data via the same buffer + event mechanism.
 */
export function ensureSSRDataBus(): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  const g = globalThis as any;
  // Always reset to empty — clear stale data from previous navigations
  g.__VERTZ_SSR_DATA__ = [];
  g.__VERTZ_SSR_PUSH__ = (key: string, data: unknown) => {
    g.__VERTZ_SSR_DATA__.push({ key, data });
    document.dispatchEvent(new CustomEvent('vertz:ssr-data', { detail: { key, data } }));
  };
}

/**
 * Push pre-fetched data into the SSR hydration bus.
 * This triggers the vertz:ssr-data CustomEvent that hydrateQueryFromSSR() listens to.
 */
export function pushNavData(key: string, data: unknown): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  const push = (globalThis as any).__VERTZ_SSR_PUSH__;
  if (typeof push === 'function') {
    push(key, data);
  }
}

/**
 * Check if a navigation pre-fetch is currently active.
 * Used by query.ts to defer client-side fetching.
 */
export function isNavPrefetchActive(): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  return (globalThis as any).__VERTZ_NAV_PREFETCH_ACTIVE__ === true;
}

function setNavPrefetchActive(active: boolean): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  (globalThis as any).__VERTZ_NAV_PREFETCH_ACTIVE__ = active;
}

function dispatchPrefetchDone(): void {
  setNavPrefetchActive(false);
  document.dispatchEvent(new CustomEvent('vertz:nav-prefetch-done'));
}

/**
 * Start pre-fetching query data for a navigation target.
 *
 * Sends a request with X-Vertz-Nav: 1 header to the dev server,
 * which responds with SSE events containing resolved query data.
 * Each data event is pushed into the SSR hydration bus.
 *
 * Returns a handle with an abort() method for cancellation.
 *
 * @param url - The navigation target URL
 * @param options - Optional timeout configuration
 */
export function prefetchNavData(
  url: string,
  options?: { timeout?: number },
): { abort: () => void; done: Promise<void> } {
  const controller = new AbortController();
  const timeout = options?.timeout ?? 5000;

  // Set up the hydration bus and active flag before fetch
  ensureSSRDataBus();
  setNavPrefetchActive(true);

  // Set up timeout
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Start the SSE fetch — the done promise resolves when the stream completes
  const done = fetch(url, {
    headers: { 'X-Vertz-Nav': '1' },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.body) {
        dispatchPrefetchDone();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSSE(buffer);
        buffer = parsed.remaining;

        for (const event of parsed.events) {
          if (event.type === 'data') {
            try {
              const { key, data } = JSON.parse(event.data) as { key: string; data: unknown };
              pushNavData(key, data);
            } catch {
              // Malformed event data — skip
            }
          } else if (event.type === 'done') {
            dispatchPrefetchDone();
            clearTimeout(timeoutId);
            return;
          }
        }
      }

      // Stream ended without done event — still finish
      dispatchPrefetchDone();
    })
    .catch(() => {
      // Network error, abort, etc. — graceful degradation
      dispatchPrefetchDone();
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });

  return {
    abort: () => {
      controller.abort();
      clearTimeout(timeoutId);
    },
    done,
  };
}
