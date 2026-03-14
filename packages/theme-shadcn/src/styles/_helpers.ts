/**
 * Generate a CSS declaration object for a background color token with opacity.
 * Uses color-mix() for broad browser support (Chrome 111+, Safari 16.2+, Firefox 113+).
 */
export function bgOpacity(token: string, percent: number): { 'background-color': string } {
  return {
    'background-color': `color-mix(in oklch, var(--color-${token}) ${percent}%, transparent)`,
  };
}

/**
 * Generate a CSS declaration object for a text color token with opacity.
 * Uses color-mix() for broad browser support.
 */
export function textOpacity(token: string, percent: number): { color: string } {
  return {
    color: `color-mix(in oklch, var(--color-${token}) ${percent}%, transparent)`,
  };
}

/** Create a CSS declaration object for a CSS animation. */
export function animationDecl(value: string): { animation: string } {
  return { animation: value };
}

/** Standard animation timing. */
export const ANIM_DURATION = '150ms';
export const ANIM_EASING = 'ease-out';

/** Dark mode selector for use in css() object-form entries. */
export const DARK = '[data-theme="dark"] &';
