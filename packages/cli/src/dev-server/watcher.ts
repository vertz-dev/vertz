export interface FileChange {
  type: 'add' | 'change' | 'remove';
  path: string;
}

export interface Watcher {
  on(event: 'change', handler: (changes: FileChange[]) => void): void;
  close(): void;
  /** @internal — for testing only */
  _emit(change: FileChange): void;
}

const DEBOUNCE_MS = 100;

const IGNORE_PATTERNS = ['/node_modules/', '/.git/', '/.vertz/generated/'];

function isIgnored(path: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => path.includes(pattern));
}

export function createWatcher(_dir: string): Watcher {
  const handlers: Array<(changes: FileChange[]) => void> = [];
  let pending: FileChange[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    for (const handler of handlers) {
      handler(batch);
    }
  }

  return {
    on(_event: 'change', handler: (changes: FileChange[]) => void) {
      handlers.push(handler);
    },
    _emit(change: FileChange) {
      if (isIgnored(change.path)) return;
      pending.push(change);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
    close() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      pending = [];
    },
  };
}
