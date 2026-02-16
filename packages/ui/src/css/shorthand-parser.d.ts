/**
 * Parses CSS shorthand strings like 'p:4', 'hover:bg:primary.700'.
 *
 * Syntax:
 * - 'property:value'          -> { property, value, pseudo: null }
 * - 'pseudo:property:value'   -> { property, value, pseudo }
 * - 'keyword'                 -> { property: keyword, value: null, pseudo: null }
 * - 'pseudo:keyword'          -> { property: keyword, value: null, pseudo }
 */
/** A parsed shorthand token. */
export interface ParsedShorthand {
  /** The shorthand property name (e.g. 'p', 'bg', 'flex'). */
  property: string;
  /** The value portion, or null for keywords like 'flex'. */
  value: string | null;
  /** The CSS pseudo-selector, or null if none. */
  pseudo: string | null;
}
/**
 * Parse a single shorthand string into its components.
 *
 * @throws {Error} if the string is empty or malformed.
 */
export declare function parseShorthand(input: string): ParsedShorthand;
/** Error thrown when shorthand parsing fails. */
export declare class ShorthandParseError extends Error {
  readonly input: string;
  constructor(message: string, input: string);
}
//# sourceMappingURL=shorthand-parser.d.ts.map
