/**
 * s() — Inline style helper.
 *
 * Provides a type-safe way to create inline style objects
 * using the same shorthand syntax as css() array entries.
 *
 * Unlike css(), s() produces inline style objects rather than
 * class names. Use for truly dynamic styles that can't be
 * determined at compile time.
 *
 * Usage:
 * ```ts
 * <div style={s(['p:4', 'bg:primary'])} />
 *
 * // Dynamic values:
 * <div style={s([`w:${width}`])} />  // raw CSS if not in scale
 * ```
 */
/**
 * Convert an array of shorthand strings into a CSS properties object
 * suitable for inline styles.
 *
 * Note: Pseudo-states are not supported in inline styles and will
 * cause an error. Use css() for pseudo-states.
 *
 * @param entries - Array of shorthand strings.
 * @returns A Record of CSS property → value pairs (kebab-case keys).
 */
export declare function s(entries: string[]): Record<string, string>;
/** Error thrown when inline styles are used incorrectly. */
export declare class InlineStyleError extends Error {
  readonly entry: string;
  constructor(message: string, entry: string);
}
//# sourceMappingURL=s.d.ts.map
