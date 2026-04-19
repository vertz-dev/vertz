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
 *   '@keyframes spin': {
 *     from: { transform: 'rotate(0deg)' },
 *     to: { transform: 'rotate(360deg)' },
 *   },
 *   '@media (min-width: 768px)': {
 *     body: { fontSize: '18px' },
 *   },
 * });
 * ```
 */

import { injectCSS } from './css';
import type { CamelCSSDeclarations } from './css-properties';

/**
 * Map of inner selectors (frame selectors like `from`/`to`/`50%`, or
 * regular selectors inside `@media`/`@supports`) to CSS declarations.
 * Nesting is one level deep — `@keyframes`, `@media`, and `@supports`
 * only ever contain a single layer of inner rules.
 */
export type NestedSelectorBlock = { [selector: string]: CamelCSSDeclarations };

/**
 * A block inside globalCss(). For regular selectors it is a CSS
 * declarations map; for at-rule keys (`@keyframes`, `@media`, `@supports`)
 * it is a nested selector → declarations map. The exact shape is
 * discriminated on the selector key at the call site via
 * {@link globalCss}'s generic input type.
 */
export type GlobalStyleBlock = CamelCSSDeclarations | NestedSelectorBlock;

/** Input to globalCss(): selector → block. */
export type GlobalCSSInput = Record<string, GlobalStyleBlock>;

/**
 * Strict per-selector block: nested for at-rules, flat declarations
 * otherwise. Keys that aren't known CSS properties resolve to `never`,
 * so typos on a regular block and mixing declarations with nested
 * at-rules under the same selector are both rejected.
 */
type StrictGlobalBlock<K extends string, V> = K extends `@${string}`
  ? NestedSelectorBlock
  : { [P in keyof V]?: P extends keyof CamelCSSDeclarations ? CamelCSSDeclarations[P] : never };

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
 * At-rules with nested blocks (`@keyframes`, `@media`, `@supports`) are
 * emitted with their inner selector blocks wrapped one level deep.
 *
 * @param input - Selector-to-block map.
 * @returns Extracted CSS.
 */
export function globalCss<const T extends Record<string, object>>(input: {
  [K in keyof T & string]: StrictGlobalBlock<K, T[K]>;
}): GlobalCSSOutput {
  const rules: string[] = [];

  for (const [selector, block] of Object.entries(input as GlobalCSSInput)) {
    rules.push(renderBlock(selector, block));
  }

  const cssText = rules.join('\n');

  injectCSS(cssText);

  return {
    css: cssText,
  };
}

/**
 * Render a selector → block pair. If any value in the block is a plain
 * object, it is treated as a nested selector (e.g. `@keyframes` frames,
 * `@media` inner selectors); otherwise it is treated as a CSS declaration.
 */
function renderBlock(selector: string, block: GlobalStyleBlock): string {
  const declarations: string[] = [];
  const nestedRules: string[] = [];

  for (const [key, value] of Object.entries(block)) {
    if (value == null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      nestedRules.push(renderBlock(key, value as CamelCSSDeclarations));
      continue;
    }
    const cssProperty = key.startsWith('--') ? key : camelToKebab(key);
    declarations.push(`  ${cssProperty}: ${value};`);
  }

  const parts: string[] = [];
  if (declarations.length > 0) {
    parts.push(`${selector} {\n${declarations.join('\n')}\n}`);
  }
  if (nestedRules.length > 0) {
    const indented = nestedRules.map((rule) => rule.replace(/^/gm, '  ')).join('\n');
    parts.push(`${selector} {\n${indented}\n}`);
  }
  return parts.join('\n');
}

/** Convert camelCase property name to kebab-case. */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
