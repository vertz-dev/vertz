import { getSSRContext } from '../ssr/ssr-render-context';
import type { Subscriber } from './signal-types';

/**
 * Batch depth counter. When > 0, effect notifications are queued.
 */
let batchDepth = 0;

/**
 * Queue of effect subscribers to notify when the outermost batch completes.
 * Uses a Map keyed by subscriber ID for deduplication.
 */
const pendingEffects: Map<number, Subscriber> = new Map();

/**
 * Schedule a subscriber notification.
 *
 * - Computed subscribers: always notified synchronously (propagate dirtiness immediately)
 * - Effect subscribers: queued and deduped when batching, notified immediately otherwise
 */
export function scheduleNotify(subscriber: Subscriber): void {
  if (!subscriber._isEffect) {
    // Computed: always synchronous — propagate dirtiness through the graph
    subscriber._notify();
    return;
  }

  const ctx = getSSRContext();
  const depth = ctx ? ctx.batchDepth : batchDepth;
  const effects = ctx ? ctx.pendingEffects : pendingEffects;

  // Effect: queue when batching, immediate otherwise
  if (depth > 0) {
    effects.set(subscriber._id, subscriber);
  } else {
    subscriber._notify();
  }
}

/**
 * Flush all pending effect notifications.
 */
function flush(effects: Map<number, Subscriber>): void {
  // Iteratively flush until stable — effects may trigger new signals
  while (effects.size > 0) {
    const queue = [...effects.values()];
    effects.clear();
    for (const sub of queue) {
      sub._notify();
    }
  }
}

/**
 * Group multiple signal writes into a single update flush.
 * Nested batches are supported — only the outermost batch triggers the flush.
 */
export function batch(fn: () => void): void {
  const ctx = getSSRContext();
  if (ctx) {
    ctx.batchDepth++;
    try {
      fn();
    } finally {
      ctx.batchDepth--;
      if (ctx.batchDepth === 0) {
        flush(ctx.pendingEffects);
      }
    }
  } else {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        flush(pendingEffects);
      }
    }
  }
}
