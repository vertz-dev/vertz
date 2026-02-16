import type { Subscriber } from './signal-types';
/**
 * Schedule a subscriber notification.
 *
 * - Computed subscribers: always notified synchronously (propagate dirtiness immediately)
 * - Effect subscribers: queued and deduped when batching, notified immediately otherwise
 */
export declare function scheduleNotify(subscriber: Subscriber): void;
/**
 * Group multiple signal writes into a single update flush.
 * Nested batches are supported — only the outermost batch triggers the flush.
 */
export declare function batch(fn: () => void): void;
//# sourceMappingURL=scheduler.d.ts.map
