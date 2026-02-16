import type { VNode } from './types';
/** Reset the slot counter (for testing). */
export declare function resetSlotCounter(): void;
/**
 * Create a Suspense slot placeholder.
 *
 * Wraps fallback content in a `<div id="v-slot-N">` so it can later
 * be replaced by the resolved async content via a template chunk.
 *
 * Returns the placeholder VNode and the assigned slot ID.
 */
export declare function createSlotPlaceholder(fallback: VNode | string): VNode & {
  _slotId: number;
};
//# sourceMappingURL=slot-placeholder.d.ts.map
