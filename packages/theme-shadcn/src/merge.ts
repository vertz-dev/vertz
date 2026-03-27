import type { PaletteTokens } from './types';

/**
 * Deep-merge color overrides into a base palette.
 *
 * Creates a new object — does not mutate the base.
 * Only merges one level deep into each token's value map.
 */
export function deepMergeTokens(
  base: PaletteTokens,
  colors: Record<string, Record<string, string> | undefined>,
): PaletteTokens {
  const result: PaletteTokens = {};

  for (const [key, values] of Object.entries(base)) {
    const override = colors[key];
    if (override) {
      result[key] = { ...values, ...override };
    } else {
      result[key] = { ...values };
    }
  }

  // Add color-only keys not present in the base palette
  for (const [key, values] of Object.entries(colors)) {
    if (!(key in result) && values) {
      result[key] = { ...values };
    }
  }

  return result;
}
