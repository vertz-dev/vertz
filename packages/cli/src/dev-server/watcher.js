const DEBOUNCE_MS = 100;
const IGNORE_PATTERNS = ['/node_modules/', '/.git/', '/.vertz/generated/'];
function isIgnored(path) {
  return IGNORE_PATTERNS.some((pattern) => path.includes(pattern));
}
export function createWatcher(_dir) {
  const handlers = [];
  let pending = [];
  let timer;
  function flush() {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    for (const handler of handlers) {
      handler(batch);
    }
  }
  return {
    on(_event, handler) {
      handlers.push(handler);
    },
    _emit(change) {
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
//# sourceMappingURL=watcher.js.map
