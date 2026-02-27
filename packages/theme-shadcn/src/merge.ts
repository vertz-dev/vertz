import type { PaletteTokens } from './types';

/**
 * Deep-merge token overrides into a base palette.
 *
 * Creates a new object — does not mutate the base.
 * Only merges one level deep into each token's value map.
 */
export function deepMergeTokens(
  base: PaletteTokens,
  overrides: Record<string, Record<string, string> | undefined>,
): PaletteTokens {
  const result: PaletteTokens = {};

  for (const [key, values] of Object.entries(base)) {
    const override = overrides[key];
    if (override) {
      result[key] = { ...values, ...override };
    } else {
      result[key] = { ...values };
    }
  }

  return result;
}
