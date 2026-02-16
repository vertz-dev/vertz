/** Counter for generating unique slot IDs. */
let slotCounter = 0;
/** Reset the slot counter (for testing). */
export function resetSlotCounter() {
  slotCounter = 0;
}
/**
 * Create a Suspense slot placeholder.
 *
 * Wraps fallback content in a `<div id="v-slot-N">` so it can later
 * be replaced by the resolved async content via a template chunk.
 *
 * Returns the placeholder VNode and the assigned slot ID.
 */
export function createSlotPlaceholder(fallback) {
  const id = slotCounter++;
  const placeholder = {
    tag: 'div',
    attrs: { id: `v-slot-${id}` },
    children: typeof fallback === 'string' ? [fallback] : [fallback],
    _slotId: id,
  };
  return placeholder;
}
//# sourceMappingURL=slot-placeholder.js.map
