import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createTokenRefresh } from '../token-refresh';

describe('createTokenRefresh', () => {
  let originalSetTimeout: typeof globalThis.setTimeout;
  let originalClearTimeout: typeof globalThis.clearTimeout;
  let timers: { callback: () => void; delay: number; id: number }[];
  let nextTimerId: number;

  beforeEach(() => {
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    timers = [];
    nextTimerId = 1;

    // @ts-expect-error - mock setTimeout to capture timer calls
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
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  it('schedules refresh at expiresAt - 10_000ms', () => {
    const onRefresh = mock(() => Promise.resolve());
    const expiresAt = Date.now() + 60_000; // 60s from now

    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(expiresAt);

    expect(timers.length).toBe(1);
    // Should be scheduled ~50s from now (60_000 - 10_000), allow 100ms tolerance
    expect(timers[0].delay).toBeGreaterThanOrEqual(49_900);
    expect(timers[0].delay).toBeLessThanOrEqual(50_000);
  });

  it('cancel clears pending timer', () => {
    const onRefresh = mock(() => Promise.resolve());
    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(Date.now() + 60_000);

    expect(timers.length).toBe(1);
    tr.cancel();
    expect(timers.length).toBe(0);
  });

  it('reschedule replaces previous timer', () => {
    const onRefresh = mock(() => Promise.resolve());
    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(Date.now() + 60_000);
    tr.schedule(Date.now() + 120_000);

    // Only one timer should be active (the second one, ~110s from now)
    expect(timers.length).toBe(1);
    expect(timers[0].delay).toBeGreaterThanOrEqual(109_900);
    expect(timers[0].delay).toBeLessThanOrEqual(110_000);
  });

  it('fires immediately when expiresAt is already stale', () => {
    const onRefresh = mock(() => Promise.resolve());
    const tr = createTokenRefresh({ onRefresh });
    // expiresAt 5s from now — less than the 10s margin
    tr.schedule(Date.now() + 5_000);

    expect(timers.length).toBe(1);
    expect(timers[0].delay).toBe(0);
  });

  it('calls onRefresh when timer fires', () => {
    const onRefresh = mock(() => Promise.resolve());
    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(Date.now() + 60_000);

    // Simulate timer firing
    timers[0].callback();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent refresh calls', async () => {
    let resolveRefresh: () => void;
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    let callCount = 0;
    const onRefresh = mock(() => {
      callCount++;
      return refreshPromise;
    });

    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(Date.now() + 60_000);

    // Fire the timer
    timers[0].callback();
    expect(callCount).toBe(1);

    // Fire again while refresh is still in-flight — should not call onRefresh again
    tr.schedule(Date.now() + 60_000);
    timers[0].callback();
    expect(callCount).toBe(1);

    // Resolve the refresh — now a new call should work
    // biome-ignore lint/style/noNonNullAssertion: test helper always assigns
    resolveRefresh!();
    await refreshPromise;

    tr.schedule(Date.now() + 60_000);
    timers[0].callback();
    expect(callCount).toBe(2);
  });

  it('clears inflight after onRefresh rejection and allows subsequent calls', async () => {
    let callCount = 0;
    const onRefresh = mock(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('refresh failed'));
      return Promise.resolve();
    });

    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(Date.now() + 60_000);

    // First fire — onRefresh rejects
    timers[0].callback();
    expect(callCount).toBe(1);

    // Wait for rejection to settle
    await new Promise((r) => originalSetTimeout(r, 10));

    // Schedule and fire again — should work since inflight was cleared
    tr.schedule(Date.now() + 60_000);
    timers[0].callback();
    expect(callCount).toBe(2);
  });

  it('dispose clears timer and visibility listener', () => {
    const origDocument = globalThis.document;
    const listeners: (() => void)[] = [];
    Object.defineProperty(globalThis, 'document', {
      value: {
        visibilityState: 'visible',
        addEventListener: ((event: string, handler: () => void) => {
          if (event === 'visibilitychange') listeners.push(handler);
        }) as typeof document.addEventListener,
        removeEventListener: ((event: string, handler: () => void) => {
          if (event === 'visibilitychange') {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
          }
        }) as typeof document.removeEventListener,
      },
      configurable: true,
      writable: true,
    });

    const onRefresh = mock(() => Promise.resolve());
    const tr = createTokenRefresh({ onRefresh });
    tr.schedule(Date.now() + 60_000);

    expect(timers.length).toBe(1);
    expect(listeners.length).toBe(1);

    tr.dispose();

    expect(timers.length).toBe(0);
    expect(listeners.length).toBe(0);

    Object.defineProperty(globalThis, 'document', {
      value: origDocument,
      configurable: true,
      writable: true,
    });
  });

  describe('online/offline', () => {
    let origNavigator: typeof globalThis.navigator;
    let origWindow: typeof globalThis.window;
    let windowListeners: Record<string, (() => void)[]>;
    let onLineValue: boolean;

    beforeEach(() => {
      origNavigator = globalThis.navigator;
      origWindow = globalThis.window;
      windowListeners = {};
      onLineValue = true;

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          get onLine() {
            return onLineValue;
          },
        },
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, 'window', {
        value: {
          addEventListener: ((event: string, handler: () => void) => {
            if (!windowListeners[event]) windowListeners[event] = [];
            windowListeners[event].push(handler);
          }) as typeof window.addEventListener,
          removeEventListener: ((event: string, handler: () => void) => {
            const list = windowListeners[event];
            if (list) {
              const idx = list.indexOf(handler);
              if (idx >= 0) list.splice(idx, 1);
            }
          }) as typeof window.removeEventListener,
        },
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: origNavigator,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'window', {
        value: origWindow,
        configurable: true,
        writable: true,
      });
    });

    it('defers refresh when offline', () => {
      onLineValue = false;

      const onRefresh = mock(() => Promise.resolve());
      const tr = createTokenRefresh({ onRefresh });
      tr.schedule(Date.now() + 60_000);

      // Timer fires while offline — should not call onRefresh
      timers[0].callback();
      expect(onRefresh).toHaveBeenCalledTimes(0);
    });

    it('triggers refresh on reconnect if stale', () => {
      onLineValue = false;

      const onRefresh = mock(() => Promise.resolve());
      const tr = createTokenRefresh({ onRefresh });
      tr.schedule(Date.now() + 5_000); // Already stale

      // Timer fires while offline — deferred
      timers[0].callback();
      expect(onRefresh).toHaveBeenCalledTimes(0);

      // Go online
      onLineValue = true;
      const onlineListeners = windowListeners.online ?? [];
      for (const listener of onlineListeners) listener();

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('tab visibility', () => {
    let visibilityListeners: (() => void)[];
    let origDocument: typeof globalThis.document;
    let mockDoc: {
      visibilityState: string;
      addEventListener: typeof document.addEventListener;
      removeEventListener: typeof document.removeEventListener;
    };

    beforeEach(() => {
      visibilityListeners = [];
      origDocument = globalThis.document;

      mockDoc = {
        visibilityState: 'visible',
        addEventListener: ((event: string, handler: () => void) => {
          if (event === 'visibilitychange') visibilityListeners.push(handler);
        }) as typeof document.addEventListener,
        removeEventListener: ((event: string, handler: () => void) => {
          if (event === 'visibilitychange') {
            const idx = visibilityListeners.indexOf(handler);
            if (idx >= 0) visibilityListeners.splice(idx, 1);
          }
        }) as typeof document.removeEventListener,
      };

      Object.defineProperty(globalThis, 'document', {
        value: mockDoc,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'document', {
        value: origDocument,
        configurable: true,
        writable: true,
      });
    });

    it('defers scheduled refresh when tab is hidden', () => {
      const onRefresh = mock(() => Promise.resolve());
      const tr = createTokenRefresh({ onRefresh });
      tr.schedule(Date.now() + 60_000);

      expect(timers.length).toBe(1);

      // Tab goes hidden
      mockDoc.visibilityState = 'hidden';
      for (const listener of visibilityListeners) listener();

      // Timer should be cleared
      expect(timers.length).toBe(0);
    });

    it('triggers refresh on tab focus if token is stale', () => {
      const onRefresh = mock(() => Promise.resolve());
      const tr = createTokenRefresh({ onRefresh });
      // Token expires in 5s — already past the 10s margin
      tr.schedule(Date.now() + 5_000);

      // Go hidden (clears timer)
      mockDoc.visibilityState = 'hidden';
      for (const listener of visibilityListeners) listener();

      // Come back visible — should reschedule with delay 0
      mockDoc.visibilityState = 'visible';
      for (const listener of visibilityListeners) listener();

      expect(timers.length).toBe(1);
      expect(timers[0].delay).toBe(0);
      // Fire the timer
      timers[0].callback();
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
