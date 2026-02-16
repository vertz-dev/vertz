/**
 * css() — Compile-time style block API.
 *
 * Accepts named style blocks with array shorthand syntax.
 * At compile time, the compiler extracts these into static CSS
 * and replaces the call with class name references.
 *
 * Usage:
 * ```ts
 * const styles = css({
 *   card: ['p:4', 'bg:background', 'rounded:lg'],
 *   title: ['font:xl', 'weight:bold', 'text:foreground'],
 * });
 *
 * // With pseudo-states:
 * const button = css({
 *   root: ['p:4', 'bg:primary', 'hover:bg:primary.700'],
 * });
 *
 * // With object form for complex selectors:
 * const fancy = css({
 *   card: [
 *     'p:4', 'bg:background',
 *     { '&::after': ['content:empty', 'block'] },
 *   ],
 * });
 * ```
 */
/** A style entry in the array: either a shorthand string or an object for nested selectors. */
export type StyleEntry = string | Record<string, string[]>;
/** Input to css(): a record of named style blocks. */
export type CSSInput = Record<string, StyleEntry[]>;
/** Output of css(): a record of block names to class names, plus extracted CSS. */
export interface CSSOutput {
  /** Map of block name → generated class name. */
  classNames: Record<string, string>;
  /** The extracted CSS string. */
  css: string;
}
/**
 * Inject CSS text into the document head via a <style> tag.
 * Only runs in browser environments. Deduplicates by CSS content.
 */
export declare function injectCSS(cssText: string): void;
/** Reset injected styles tracking. Used in tests. */
export declare function resetInjectedStyles(): void;
/**
 * Process a css() call and produce class names + extracted CSS.
 *
 * In production, the compiler replaces css() calls at build time.
 * This runtime implementation is used for:
 * - Development mode
 * - Testing
 * - SSR fallback
 *
 * @param input - Named style blocks.
 * @param filePath - Source file path for deterministic hashing.
 * @returns Class names map and extracted CSS.
 */
export declare function css(input: CSSInput, filePath?: string): CSSOutput;
//# sourceMappingURL=css.d.ts.map
