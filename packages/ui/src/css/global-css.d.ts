/**
 * globalCss() — Define global/reset styles.
 *
 * Unlike css(), globalCss() produces unscoped CSS rules
 * for resets, base typography, and global design tokens.
 *
 * Usage:
 * ```ts
 * const reset = globalCss({
 *   '*, *::before, *::after': {
 *     boxSizing: 'border-box',
 *     margin: '0',
 *   },
 *   ':root': {
 *     '--color-primary': '#3b82f6',
 *     '--color-background': '#ffffff',
 *   },
 *   body: {
 *     fontFamily: 'system-ui, sans-serif',
 *     lineHeight: '1.5',
 *   },
 * });
 * ```
 */
/** Input to globalCss(): selector → property-value map. */
export type GlobalCSSInput = Record<string, Record<string, string>>;
/** Output of globalCss(): extracted CSS string. */
export interface GlobalCSSOutput {
  /** The extracted global CSS string. */
  css: string;
}
/**
 * Process a globalCss() call and produce global CSS rules.
 *
 * Properties use camelCase and are converted to kebab-case.
 * CSS custom properties (--*) are passed through as-is.
 *
 * @param input - Selector-to-properties map.
 * @returns Extracted CSS.
 */
export declare function globalCss(input: GlobalCSSInput): GlobalCSSOutput;
//# sourceMappingURL=global-css.d.ts.map
