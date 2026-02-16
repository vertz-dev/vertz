/**
 * Deterministic unique ID generation for ARIA attributes.
 * Used for aria-labelledby, aria-controls, aria-describedby, etc.
 */
let counter = 0;
/**
 * Generate a unique ID string with an optional prefix.
 * IDs are deterministic within a session (incrementing counter).
 */
export function uniqueId(prefix = 'vz') {
  return `${prefix}-${++counter}`;
}
/**
 * Generate a pair of linked IDs for trigger/content relationships.
 * Returns { triggerId, contentId } for use with aria-controls / aria-labelledby.
 */
export function linkedIds(prefix = 'vz') {
  const base = uniqueId(prefix);
  return {
    triggerId: `${base}-trigger`,
    contentId: `${base}-content`,
  };
}
/**
 * Reset the ID counter (useful for tests).
 */
export function resetIdCounter() {
  counter = 0;
}
//# sourceMappingURL=id.js.map
