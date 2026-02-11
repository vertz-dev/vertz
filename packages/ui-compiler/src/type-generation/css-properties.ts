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
export function generateCSSProperties(input: CSSPropertiesInput): string {
  const varRefs: string[] = [];

  // Process color tokens → var references
  for (const [name, values] of Object.entries(input.colors)) {
    for (const key of Object.keys(values)) {
      if (key === 'DEFAULT') {
        varRefs.push(`'var(--color-${name})'`);
      } else if (!key.startsWith('_')) {
        varRefs.push(`'var(--color-${name}-${key})'`);
      }
    }
  }

  // Process spacing tokens → var references
  if (input.spacing) {
    for (const name of Object.keys(input.spacing)) {
      varRefs.push(`'var(--spacing-${name})'`);
    }
  }

  const unionMembers = varRefs.length > 0 ? varRefs.join(' | ') : 'never';

  const lines: string[] = [];
  lines.push(`type ThemeTokenVar = ${unionMembers};`);
  lines.push('');
  lines.push('export interface CSSProperties {');
  lines.push('  color?: ThemeTokenVar | string;');
  lines.push('  backgroundColor?: ThemeTokenVar | string;');
  lines.push('  borderColor?: ThemeTokenVar | string;');
  lines.push('  padding?: ThemeTokenVar | string;');
  lines.push('  margin?: ThemeTokenVar | string;');
  lines.push('  gap?: ThemeTokenVar | string;');
  lines.push('  width?: ThemeTokenVar | string;');
  lines.push('  height?: ThemeTokenVar | string;');
  lines.push('}');

  return lines.join('\n');
}
