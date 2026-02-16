/**
 * Parses CSS shorthand strings like 'p:4', 'hover:bg:primary.700'.
 *
 * Syntax:
 * - 'property:value'          -> { property, value, pseudo: null }
 * - 'pseudo:property:value'   -> { property, value, pseudo }
 * - 'keyword'                 -> { property: keyword, value: null, pseudo: null }
 * - 'pseudo:keyword'          -> { property: keyword, value: null, pseudo }
 */
import { PSEUDO_MAP, PSEUDO_PREFIXES } from './token-tables';

/** Keywords that resolve to display values with no explicit value. */
const DISPLAY_KEYWORDS = new Set(['flex', 'grid', 'block', 'inline', 'hidden']);
/**
 * Parse a single shorthand string into its components.
 *
 * @throws {Error} if the string is empty or malformed.
 */
export function parseShorthand(input) {
  if (!input || input.trim() === '') {
    throw new ShorthandParseError('Empty shorthand string', input);
  }
  const trimmed = input.trim();
  const parts = splitShorthand(trimmed);
  if (parts.length === 1) {
    // Single keyword: 'flex', 'grid', 'block', etc.
    const [property] = parts;
    return { property, value: null, pseudo: null };
  }
  if (parts.length === 2) {
    const [first, second] = parts;
    // Check if first part is a pseudo prefix
    if (PSEUDO_PREFIXES.has(first)) {
      const pseudo = PSEUDO_MAP[first] ?? first;
      // 'hover:flex' -> pseudo keyword
      if (DISPLAY_KEYWORDS.has(second)) {
        return { property: second, value: null, pseudo };
      }
      // 'hover:keyword' -- treat as pseudo + keyword for non-display keywords too
      // But this is ambiguous with 'property:value'.
      // Rule: if first is a known pseudo, treat as pseudo:keyword
      return { property: second, value: null, pseudo };
    }
    // 'property:value'
    return { property: first, value: second, pseudo: null };
  }
  if (parts.length === 3) {
    const [first, second, third] = parts;
    if (!PSEUDO_PREFIXES.has(first)) {
      throw new ShorthandParseError(
        `Unknown pseudo prefix '${first}'. Supported: ${[...PSEUDO_PREFIXES].join(', ')}`,
        input,
      );
    }
    return {
      property: second,
      value: third,
      pseudo: PSEUDO_MAP[first] ?? first,
    };
  }
  throw new ShorthandParseError(
    `Too many segments (${parts.length}). Expected 'property:value' or 'pseudo:property:value'`,
    input,
  );
}
/**
 * Split a shorthand string by ':' but handle 'focus-visible' as a single token.
 * We split on ':' only where it acts as a separator (not inside pseudo names).
 */
function splitShorthand(input) {
  // Handle 'focus-visible' specially -- it contains no colons itself,
  // but could be confused if we do naive splitting.
  // Actually, since 'focus-visible' doesn't contain ':', simple split works.
  return input.split(':');
}
/** Error thrown when shorthand parsing fails. */
export class ShorthandParseError extends Error {
  input;
  constructor(message, input) {
    super(`Invalid shorthand '${input}': ${message}`);
    this.name = 'ShorthandParseError';
    this.input = input;
  }
}
//# sourceMappingURL=shorthand-parser.js.map
