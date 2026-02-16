/**
 * Theme type generation.
 *
 * Generates TypeScript type definitions from a theme input,
 * producing a `ThemeTokens` type with all resolved token paths
 * as string-typed keys.
 *
 * Usage:
 * ```ts
 * const source = generateThemeTypes(themeInput);
 * // Produces:
 * // export type ThemeTokens = {
 * //   'primary.500': string;
 * //   'background': string;
 * // };
 * ```
 */
/** Color tokens: a map of color names to their raw/contextual values. */
type ColorTokens = Record<string, Record<string, string>>;
/** Spacing tokens: a flat map of names to CSS values. */
type SpacingTokens = Record<string, string>;
/** Theme input matching defineTheme() input shape. */
export interface ThemeTypeInput {
  colors: ColorTokens;
  spacing?: SpacingTokens;
}
/**
 * Generate TypeScript source for a ThemeTokens type from a theme definition.
 *
 * @param input - Theme token definitions (same shape as defineTheme input).
 * @returns TypeScript source string with exported ThemeTokens type.
 */
export declare function generateThemeTypes(input: ThemeTypeInput): string;
//# sourceMappingURL=theme-types.d.ts.map
