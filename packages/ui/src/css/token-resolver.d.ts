/**
 * Resolves design tokens and shorthand values to CSS property-value pairs.
 *
 * The property map translates shorthand names (p, bg, text, etc.) to CSS properties.
 * Values go through the token resolution pipeline:
 *   1. Spacing scale numbers -> rem values
 *   2. Named tokens -> CSS custom properties
 *   3. Named size values (sm, md, lg) -> concrete values
 *   4. Passthrough for raw CSS values
 */
import type { ParsedShorthand } from './shorthand-parser';
/** A resolved CSS declaration. */
export interface ResolvedStyle {
  /** CSS property name(s). */
  declarations: CSSDeclaration[];
  /** Pseudo-selector if any. */
  pseudo: string | null;
}
/** A single CSS property-value pair. */
export interface CSSDeclaration {
  property: string;
  value: string;
}
/** Error thrown when token resolution fails. */
export declare class TokenResolveError extends Error {
  readonly shorthand: string;
  constructor(message: string, shorthand: string);
}
/**
 * Resolve a parsed shorthand into CSS declarations.
 */
export declare function resolveToken(parsed: ParsedShorthand): ResolvedStyle;
/**
 * Check if a property shorthand is known.
 */
export declare function isKnownProperty(name: string): boolean;
/**
 * Check if a color token is valid.
 */
export declare function isValidColorToken(value: string): boolean;
//# sourceMappingURL=token-resolver.d.ts.map
