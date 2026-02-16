/**
 * Token-aware CSS properties type generation.
 *
 * Generates a `CSSProperties` interface and a `ThemeTokenVar` union type
 * that knows about the theme's token names. This enables type-safe usage
 * of CSS custom property references like `var(--color-primary-500)`.
 *
 * Usage:
 * ```ts
 * const source = generateCSSProperties(themeInput);
 * // Produces:
 * // type ThemeTokenVar = 'var(--color-primary-500)' | 'var(--color-background)' | ...;
 * // export interface CSSProperties {
 * //   color?: ThemeTokenVar | string;
 * //   backgroundColor?: ThemeTokenVar | string;
 * //   ...
 * // }
 * ```
 */
/** Color tokens: a map of color names to their raw/contextual values. */
type ColorTokens = Record<string, Record<string, string>>;
/** Spacing tokens: a flat map of names to CSS values. */
type SpacingTokens = Record<string, string>;
/** Theme input matching defineTheme() input shape. */
export interface CSSPropertiesInput {
  colors: ColorTokens;
  spacing?: SpacingTokens;
}
/**
 * Generate TypeScript source for a token-aware CSSProperties interface.
 *
 * @param input - Theme token definitions (same shape as defineTheme input).
 * @returns TypeScript source string with ThemeTokenVar type and CSSProperties interface.
 */
export declare function generateCSSProperties(input: CSSPropertiesInput): string;
//# sourceMappingURL=css-properties.d.ts.map
