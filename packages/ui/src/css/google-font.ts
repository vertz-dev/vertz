/**
 * Google Fonts auto-fetch API.
 *
 * googleFont() creates a FontDescriptor with __google metadata.
 * The dev server / build pipeline resolves the metadata to local .woff2 files.
 */

import type { FontDescriptor } from './font';

type FontStyle = 'normal' | 'italic';
type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

export interface GoogleFontOptions {
  /** Weight range ('100..900') or specific weights ([400, 700]). */
  weight: string | number | number[];
  /** Font style(s). Default: 'normal'. */
  style?: FontStyle | FontStyle[];
  /** font-display strategy. Default: 'swap'. */
  display?: FontDisplay;
  /** Character subsets. Default: ['latin']. */
  subsets?: string[];
  /** Fallback fonts. Auto-detected from Google's font category if omitted. */
  fallback?: string[];
  /** Enable metric-adjusted fallback @font-face. Default: true. */
  adjustFontFallback?: boolean;
}

/**
 * Declare a Google Font for auto-fetch at dev/build time.
 *
 * Returns a FontDescriptor with `src: undefined` and `__google` metadata.
 * The dev server / build pipeline resolves the metadata to local .woff2 files.
 */
export function googleFont(family: string, options: GoogleFontOptions): FontDescriptor {
  const style = options.style ?? 'normal';
  const styles: FontStyle[] = Array.isArray(style) ? style : [style];
  const display = options.display ?? 'swap';
  const subsets = options.subsets ?? ['latin'];
  const weight = typeof options.weight === 'number' ? String(options.weight) : options.weight;

  return {
    __brand: 'FontDescriptor',
    family,
    weight: Array.isArray(weight) ? weight.join(';') : String(weight),
    style: styles[0] ?? 'normal',
    display,
    src: undefined,
    fallback: options.fallback ?? [],
    subsets,
    adjustFontFallback: options.adjustFontFallback ?? true,
    __google: {
      family,
      weight: options.weight,
      style: styles,
      subsets,
      display,
    },
  };
}
