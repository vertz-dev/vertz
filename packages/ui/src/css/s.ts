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

import { parseShorthand } from './shorthand-parser';
import { resolveToken } from './token-resolver';

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
export function s(entries: string[]): Record<string, string> {
  const styles: Record<string, string> = {};

  for (const entry of entries) {
    const parsed = parseShorthand(entry);

    if (parsed.pseudo) {
      throw new InlineStyleError(
        `Pseudo-state '${parsed.pseudo}' is not supported in inline styles. Use css() instead.`,
        entry,
      );
    }

    const resolved = resolveToken(parsed);
    for (const decl of resolved.declarations) {
      // Convert kebab-case to camelCase for inline style objects
      styles[kebabToCamel(decl.property)] = decl.value;
    }
  }

  return styles;
}

/** Convert kebab-case CSS property to camelCase for inline styles. */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Error thrown when inline styles are used incorrectly. */
export class InlineStyleError extends Error {
  readonly entry: string;

  constructor(message: string, entry: string) {
    super(message);
    this.name = 'InlineStyleError';
    this.entry = entry;
  }
}
