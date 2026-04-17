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

import { getSSRContext } from '../ssr/ssr-render-context';
import { generateClassName } from './class-generator';
import { parseShorthand } from './shorthand-parser';
import type { CSSDeclaration } from './token-resolver';
import { resolveToken } from './token-resolver';
import type { CSSDeclarations } from './css-properties';
import type { StyleBlock } from './style-block';
import { isToken } from './token';
import { UNITLESS_PROPERTIES } from './unitless-properties';
import type { UtilityClass } from './utility-types';

/**
 * A value within a nested selector array: utility class string or CSS declarations map.
 *
 * Use a utility string for design token shorthands: 'p:4', 'bg:primary'
 * Use CSSDeclarations for raw CSS: { 'flex-direction': 'row' }
 */
export type StyleValue = UtilityClass | CSSDeclarations;

/**
 * A style entry: utility class string or nested selectors map.
 *
 * Nested selector values can be:
 * - Array form: ['text:foreground', { 'background-color': 'red' }]
 * - Direct object: { 'flex-direction': 'row', 'align-items': 'center' }
 */
export type StyleEntry = UtilityClass | Record<string, StyleValue[] | CSSDeclarations>;

/** Input to css(): a record of named style blocks. Each block is either a
 * token-string array (legacy form) or a `StyleBlock` object (preferred form). */
export type CSSInput = Record<string, StyleEntry[] | StyleBlock>;

/**
 * Output of css(): block names as top-level properties, plus non-enumerable `css`.
 *
 * Generic constraint is intentionally loose (`Record<string, unknown>`) because
 * CSSOutput only uses `keyof T` to map names to class strings — it never inspects
 * the block values themselves. This accepts both array-form and object-form inputs.
 */
export type CSSOutput<T extends Record<string, unknown> = CSSInput> = {
  readonly [K in keyof T & string]: string;
} & { readonly css: string };

/** Default file path used when none is provided (runtime fallback). */
const DEFAULT_FILE_PATH = '__runtime__';

// ─── Runtime CSS injection ──────────────────────────────────────

/** Track which CSS strings have already been injected to avoid duplicates. */
const injectedCSS = new Set<string>();

/** Track CSSStyleSheet instances created by vertz for cleanup. */
const vertzSheets = new Set<CSSStyleSheet>();

/**
 * Inject CSS text into the document head via a <style> tag.
 * Only runs in browser environments. Deduplicates by CSS content.
 *
 * In SSR, document.head is freshly created per request by installDomShim().
 * The module-level dedup Set would incorrectly block injection on request 2+
 * since the Set persists across requests while document.head is replaced.
 * We bypass dedup when SSR context is active.
 */
export function injectCSS(cssText: string): void {
  if (!cssText) return;

  const ssrCtx = getSSRContext();
  const isSSR = ssrCtx !== undefined;

  // Always track CSS for SSR collection via getInjectedCSS().
  // In browser mode, also use it for dedup (skip if already injected).
  if (!isSSR && injectedCSS.has(cssText)) return;
  injectedCSS.add(cssText);

  // In SSR, write to per-request tracker for render-scoped collection,
  // then skip DOM injection (not safe with concurrent SSR renders).
  if (isSSR) {
    ssrCtx.cssTracker?.add(cssText);
    return;
  }

  // Skip DOM injection when document is unavailable (e.g. module-level
  // css() calls during SSR import, before the DOM shim is installed).
  if (typeof document === 'undefined') return;

  // Prefer adoptedStyleSheets when available (better perf, no DOM mutation)
  if (typeof CSSStyleSheet !== 'undefined' && document.adoptedStyleSheets !== undefined) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    vertzSheets.add(sheet);
    return;
  }

  // Fallback to <style> tag for older browsers / SSR shim
  const style = document.createElement('style');
  style.setAttribute('data-vertz-css', '');
  style.textContent = cssText;
  document.head.appendChild(style);
}

/** Reset injected styles tracking. Used in tests. */
export function resetInjectedStyles(): void {
  injectedCSS.clear();
  if (typeof document !== 'undefined' && document.adoptedStyleSheets !== undefined) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => !vertzSheets.has(s));
  }
  vertzSheets.clear();
}

/** Get all CSS strings that have been injected. Used by SSR to collect styles. */
export function getInjectedCSS(): string[] {
  return Array.from(injectedCSS);
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

  // Fingerprint is only needed when filePath is the runtime default, to
  // disambiguate `css({ root: A })` vs `css({ root: B })` in the same process.
  // When filePath is a real source path, the compiler's class-name formula
  // (filePath::blockName — no fingerprint) must match the runtime's so
  // SSR/HMR hybrid output doesn't produce ghost classes. See
  // packages/ui/src/css/__tests__/class-name-parity.test.ts.
  const useFingerprint = filePath === DEFAULT_FILE_PATH;

  for (const [blockName, blockValue] of Object.entries(input)) {
    if (!Array.isArray(blockValue)) {
      const styleFingerprint = useFingerprint ? serializeBlock(blockValue) : '';
      const className = generateClassName(filePath, blockName, styleFingerprint);
      classNames[blockName] = className;
      cssRules.push(...renderStyleBlock(blockValue, `.${className}`));
      continue;
    }

    const entries = blockValue;
    const styleFingerprint = useFingerprint ? serializeEntries(entries) : '';
    const className = generateClassName(filePath, blockName, styleFingerprint);
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
        // Object form: nested selectors with array or direct object values
        for (const [selector, nestedValue] of Object.entries(entry)) {
          const nestedDecls: CSSDeclaration[] = [];
          if (Array.isArray(nestedValue)) {
            // Array form: ['text:foreground', { 'background-color': 'red' }]
            for (const nestedEntry of nestedValue) {
              if (typeof nestedEntry === 'string') {
                const parsed = parseShorthand(nestedEntry);
                const resolved = resolveToken(parsed);
                nestedDecls.push(...resolved.declarations);
              } else {
                // CSS declarations map: { 'background-color': 'red', ... }
                for (const [prop, val] of Object.entries(nestedEntry) as [string, string][]) {
                  nestedDecls.push({ property: prop, value: val });
                }
              }
            }
          } else {
            // Direct object form: { 'flex-direction': 'row', 'align-items': 'center' }
            for (const [prop, val] of Object.entries(nestedValue) as [string, string][]) {
              nestedDecls.push({ property: prop, value: val });
            }
          }
          if (selector.startsWith('@')) {
            // At-rules (@media, @container, etc.) wrap the class selector inside
            nestedRules.push(formatAtRule(selector, `.${className}`, nestedDecls));
          } else {
            const resolvedSelector = selector.replaceAll('&', `.${className}`);
            nestedRules.push(formatRule(resolvedSelector, nestedDecls));
          }
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

/**
 * Serialize style entries into a stable string for fingerprinting.
 * Used to disambiguate blocks with the same name but different styles.
 */
function serializeEntries(entries: StyleEntry[]): string {
  return entries
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      // Object form: serialize selector + values
      return Object.entries(entry)
        .map(([sel, val]) => {
          if (Array.isArray(val)) {
            const serialized = val
              .map((v) => {
                if (typeof v === 'string') return v;
                // Sort keys for deterministic fingerprinting
                const obj = v as Record<string, string>;
                return Object.keys(obj)
                  .sort()
                  .map((k) => `${k}=${obj[k]}`)
                  .join(',');
              })
              .join(',');
            return `${sel}:{${serialized}}`;
          }
          // Direct object form: sort keys for deterministic fingerprinting
          const obj = val as Record<string, string>;
          const serialized = Object.keys(obj)
            .sort()
            .map((k) => `${k}=${obj[k]}`)
            .join(',');
          return `${sel}:{${serialized}}`;
        })
        .join(';');
    })
    .join('|');
}

function isStyleBlock(value: unknown): value is StyleBlock {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !isToken(value)
  );
}

/** camelCase CSS property name → kebab-case, with vendor-prefix handling. */
function camelToKebab(prop: string): string {
  const third = prop[2];
  if (prop.startsWith('ms') && third !== undefined && third >= 'A' && third <= 'Z') {
    prop = `Ms${prop.slice(2)}`;
  }
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function formatStyleValue(camelKey: string, value: string | number): string {
  if (
    typeof value !== 'number' ||
    value === 0 ||
    camelKey.startsWith('--') ||
    UNITLESS_PROPERTIES.has(camelKey)
  ) {
    return String(value);
  }
  return `${value}px`;
}

/** Render a StyleBlock as a list of CSS rules rooted at `classSelector`. */
function renderStyleBlock(block: StyleBlock, classSelector: string): string[] {
  const declarations: CSSDeclaration[] = [];
  const nestedRules: string[] = [];

  for (const [key, value] of Object.entries(block)) {
    if (value == null) continue;
    if (key.startsWith('&')) {
      const childSelector = key.replaceAll('&', classSelector);
      nestedRules.push(...renderStyleBlock(value as StyleBlock, childSelector));
      continue;
    }
    if (key.startsWith('@')) {
      const innerRules = renderStyleBlock(value as StyleBlock, classSelector);
      nestedRules.push(wrapAtRule(key, innerRules));
      continue;
    }
    const property = key.startsWith('--') ? key : camelToKebab(key);
    declarations.push({ property, value: formatStyleValue(key, value as string | number) });
  }

  const out: string[] = [];
  if (declarations.length > 0) {
    out.push(formatRule(classSelector, declarations));
  }
  out.push(...nestedRules);
  return out;
}

/** Wrap a set of already-rendered rules inside an at-rule. */
function wrapAtRule(atRule: string, innerRules: string[]): string {
  const indented = innerRules.map((rule) => rule.replace(/^/gm, '  ')).join('\n');
  return `${atRule} {\n${indented}\n}`;
}

/** Deterministic fingerprint of a StyleBlock (sorted keys, recursed). */
function serializeBlock(block: StyleBlock): string {
  const keys = Object.keys(block).sort();
  return keys
    .map((key) => {
      const value = (block as Record<string, unknown>)[key];
      if (isStyleBlock(value)) {
        return `${key}:{${serializeBlock(value)}}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(';');
}

/** Format a CSS rule from selector + declarations. */
function formatRule(selector: string, declarations: CSSDeclaration[]): string {
  const props = declarations.map((d) => `  ${d.property}: ${d.value};`).join('\n');
  return `${selector} {\n${props}\n}`;
}

/** Format an at-rule (@media, @container) wrapping a class selector. */
function formatAtRule(
  atRule: string,
  classSelector: string,
  declarations: CSSDeclaration[],
): string {
  const props = declarations.map((d) => `    ${d.property}: ${d.value};`).join('\n');
  return `${atRule} {\n  ${classSelector} {\n${props}\n  }\n}`;
}
