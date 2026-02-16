/**
 * Batch depth counter. When > 0, effect notifications are queued.
 */
let batchDepth = 0;
/**
 * Queue of effect subscribers to notify when the outermost batch completes.
 * Uses a Map keyed by subscriber ID for deduplication.
 */
const pendingEffects = new Map();
/**
 * Schedule a subscriber notification.
 *
 * - Computed subscribers: always notified synchronously (propagate dirtiness immediately)
 * - Effect subscribers: queued and deduped when batching, notified immediately otherwise
 */
export function scheduleNotify(subscriber) {
  if (!subscriber._isEffect) {
    // Computed: always synchronous — propagate dirtiness through the graph
    subscriber._notify();
    return;
  }
  // Effect: queue when batching, immediate otherwise
  if (batchDepth > 0) {
    pendingEffects.set(subscriber._id, subscriber);
  } else {
    subscriber._notify();
  }
}
/**
 * Flush all pending effect notifications.
 */
function flush() {
  // Iteratively flush until stable — effects may trigger new signals
  while (pendingEffects.size > 0) {
    const queue = [...pendingEffects.values()];
    pendingEffects.clear();
    for (const sub of queue) {
      sub._notify();
    }
  }
}
/**
 * Group multiple signal writes into a single update flush.
 * Nested batches are supported — only the outermost batch triggers the flush.
 */
export function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flush();
    }
  }
}
//# sourceMappingURL=scheduler.js.map
