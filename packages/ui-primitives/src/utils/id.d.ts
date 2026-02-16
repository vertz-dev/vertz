/**
 * Deterministic unique ID generation for ARIA attributes.
 * Used for aria-labelledby, aria-controls, aria-describedby, etc.
 */
/**
 * Generate a unique ID string with an optional prefix.
 * IDs are deterministic within a session (incrementing counter).
 */
export declare function uniqueId(prefix?: string): string;
/**
 * Generate a pair of linked IDs for trigger/content relationships.
 * Returns { triggerId, contentId } for use with aria-controls / aria-labelledby.
 */
export declare function linkedIds(prefix?: string): {
  triggerId: string;
  contentId: string;
};
/**
 * Reset the ID counter (useful for tests).
 */
export declare function resetIdCounter(): void;
//# sourceMappingURL=id.d.ts.map
