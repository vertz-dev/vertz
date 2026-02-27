import type { RawDeclaration } from '@vertz/ui';

/**
 * Generate a raw CSS declaration for a background color token with opacity.
 * Uses color-mix() for broad browser support (Chrome 111+, Safari 16.2+, Firefox 113+).
 */
export function bgOpacity(token: string, percent: number): RawDeclaration {
  return {
    property: 'background-color',
    value: `color-mix(in oklch, var(--color-${token}) ${percent}%, transparent)`,
  };
}

/**
 * Generate a raw CSS declaration for a text color token with opacity.
 * Uses color-mix() for broad browser support.
 */
export function textOpacity(token: string, percent: number): RawDeclaration {
  return {
    property: 'color',
    value: `color-mix(in oklch, var(--color-${token}) ${percent}%, transparent)`,
  };
}

/** Dark mode selector for use in css() object-form entries. */
export const DARK = '[data-theme="dark"] &';
