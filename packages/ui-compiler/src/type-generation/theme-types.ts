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
export function generateThemeTypes(input: ThemeTypeInput): string {
  const entries: string[] = [];

  // Process color tokens
  for (const [name, values] of Object.entries(input.colors)) {
    for (const key of Object.keys(values)) {
      if (key === 'DEFAULT') {
        // Contextual token: use the base name as the path
        entries.push(`  '${name}': string;`);
      } else if (!key.startsWith('_')) {
        // Raw shade token: name.shade (skip _dark, _light variant keys)
        entries.push(`  '${name}.${key}': string;`);
      }
    }
  }

  // Process spacing tokens
  if (input.spacing) {
    for (const name of Object.keys(input.spacing)) {
      entries.push(`  'spacing.${name}': string;`);
    }
  }

  return `export type ThemeTokens = {\n${entries.join('\n')}\n};`;
}
