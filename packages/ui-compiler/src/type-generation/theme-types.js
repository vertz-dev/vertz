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
/**
 * Generate TypeScript source for a ThemeTokens type from a theme definition.
 *
 * @param input - Theme token definitions (same shape as defineTheme input).
 * @returns TypeScript source string with exported ThemeTokens type.
 */
export function generateThemeTypes(input) {
  const entries = [];
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
//# sourceMappingURL=theme-types.js.map
