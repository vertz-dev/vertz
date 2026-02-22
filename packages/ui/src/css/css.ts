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

import { generateClassName } from './class-generator';
import { parseShorthand } from './shorthand-parser';
import type { CSSDeclaration } from './token-resolver';
import { resolveToken } from './token-resolver';

/** A style entry in the array: either a shorthand string or an object for nested selectors. */
export type StyleEntry = string | Record<string, string[]>;

/** Input to css(): a record of named style blocks. */
export type CSSInput = Record<string, StyleEntry[]>;

/** Output of css(): block names as top-level properties, plus non-enumerable `css`. */
export type CSSOutput<T extends CSSInput = CSSInput> = {
  readonly [K in keyof T & string]: string;
} & { readonly css: string };

/** Default file path used when none is provided (runtime fallback). */
const DEFAULT_FILE_PATH = '__runtime__';

// ─── Runtime CSS injection ──────────────────────────────────────

/** Track which CSS strings have already been injected to avoid duplicates. */
const injectedCSS = new Set<string>();

/**
 * Inject CSS text into the document head via a <style> tag.
 * Only runs in browser environments. Deduplicates by CSS content.
 */
export function injectCSS(cssText: string): void {
  if (!cssText || typeof document === 'undefined' || injectedCSS.has(cssText)) return;
  injectedCSS.add(cssText);
  const style = document.createElement('style');
  style.setAttribute('data-vertz-css', '');
  style.textContent = cssText;
  document.head.appendChild(style);
}

/** Reset injected styles tracking. Used in tests. */
export function resetInjectedStyles(): void {
  injectedCSS.clear();
}

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
 * @returns Object with block names as keys (class name strings) and non-enumerable `css` property.
 */
export function css<T extends CSSInput>(
  input: T & { [K in keyof T & 'css']?: never },
  filePath: string = DEFAULT_FILE_PATH,
): CSSOutput<T> {
  if ('css' in input) {
    throw new Error("css(): block name 'css' is reserved. Rename the block.");
  }

  const classNames: Record<string, string> = {};
  const cssRules: string[] = [];

  for (const [blockName, entries] of Object.entries(input)) {
    const className = generateClassName(filePath, blockName);
    classNames[blockName] = className;

    const baseDeclarations: CSSDeclaration[] = [];
    const pseudoDeclarations: Map<string, CSSDeclaration[]> = new Map();
    const nestedRules: string[] = [];

    for (const entry of entries) {
      if (typeof entry === 'string') {
        const parsed = parseShorthand(entry);
        const resolved = resolveToken(parsed);

        if (resolved.pseudo) {
          const existing = pseudoDeclarations.get(resolved.pseudo) ?? [];
          existing.push(...resolved.declarations);
          pseudoDeclarations.set(resolved.pseudo, existing);
        } else {
          baseDeclarations.push(...resolved.declarations);
        }
      } else {
        // Object form: { '&::after': ['content:empty', 'block'] }
        for (const [selector, nestedEntries] of Object.entries(entry)) {
          const nestedDecls: CSSDeclaration[] = [];
          for (const nestedEntry of nestedEntries) {
            const parsed = parseShorthand(nestedEntry);
            const resolved = resolveToken(parsed);
            nestedDecls.push(...resolved.declarations);
          }
          const resolvedSelector = selector.replace('&', `.${className}`);
          nestedRules.push(formatRule(resolvedSelector, nestedDecls));
        }
      }
    }

    // Base rule
    if (baseDeclarations.length > 0) {
      cssRules.push(formatRule(`.${className}`, baseDeclarations));
    }

    // Pseudo rules
    for (const [pseudo, declarations] of pseudoDeclarations) {
      cssRules.push(formatRule(`.${className}${pseudo}`, declarations));
    }

    // Nested rules
    cssRules.push(...nestedRules);
  }

  const cssText = cssRules.join('\n');

  // In dev mode (runtime), auto-inject CSS into the DOM.
  // In production, the compiler handles CSS extraction.
  injectCSS(cssText);

  const result = { ...classNames } as Record<string, string>;
  Object.defineProperty(result, 'css', {
    value: cssText,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return result as CSSOutput<T>;
}

/** Format a CSS rule from selector + declarations. */
function formatRule(selector: string, declarations: CSSDeclaration[]): string {
  const props = declarations.map((d) => `  ${d.property}: ${d.value};`).join('\n');
  return `${selector} {\n${props}\n}`;
}
