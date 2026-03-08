export interface TokenRefreshOptions {
  onRefresh: () => Promise<void>;
}

export interface TokenRefreshController {
  schedule(expiresAt: number): void;
  cancel(): void;
  dispose(): void;
}

const REFRESH_MARGIN_MS = 10_000;

export function createTokenRefresh({ onRefresh }: TokenRefreshOptions): TokenRefreshController {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let inflightPromise: Promise<void> | null = null;
  let lastExpiresAt: number | null = null;
  let pendingOfflineRefresh = false;

  function schedule(expiresAt: number): void {
    lastExpiresAt = expiresAt;
    pendingOfflineRefresh = false;
    clearTimer();
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_MARGIN_MS);
    timerId = setTimeout(() => {
      executeRefresh();
    }, delay);
  }

  function executeRefresh(): void {
    // Deduplicate: skip if a refresh is already in-flight
    if (inflightPromise) return;

    // Defer if offline (only when navigator.onLine is explicitly false)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      pendingOfflineRefresh = true;
      return;
    }

    inflightPromise = onRefresh().finally(() => {
      inflightPromise = null;
    });
  }

  function clearTimer(): void {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
  }

  function cancel(): void {
    clearTimer();
    lastExpiresAt = null;
    pendingOfflineRefresh = false;
  }

  // Tab visibility handling
  let visibilityHandler: (() => void) | undefined;
  if (typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer();
      } else if (lastExpiresAt !== null) {
        schedule(lastExpiresAt);
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  // Online/offline handling
  let onlineHandler: (() => void) | undefined;
  if (typeof window !== 'undefined') {
    onlineHandler = () => {
      if (pendingOfflineRefresh) {
        pendingOfflineRefresh = false;
        executeRefresh();
      }
    };
    window.addEventListener('online', onlineHandler);
  }

  function dispose(): void {
    cancel();
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    if (onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', onlineHandler);
    }
  }

  return { schedule, cancel, dispose };
}
