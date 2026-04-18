/**
 * css() — Compile-time style block API.
 *
 * Accepts named style blocks as object literals using camelCase property
 * names, nested `&`/`@` selectors, and `token.*` values. At compile time,
 * the compiler extracts these into static CSS and replaces the call with
 * class name references.
 *
 * Usage:
 * ```ts
 * const styles = css({
 *   card: {
 *     padding: token.spacing[4],
 *     backgroundColor: token.color.background,
 *     borderRadius: token.radius.lg,
 *   },
 *   title: {
 *     fontSize: token.font.size.xl,
 *     fontWeight: token.font.weight.bold,
 *   },
 * });
 *
 * // With pseudo-states and nested selectors:
 * const button = css({
 *   root: {
 *     padding: token.spacing[4],
 *     backgroundColor: token.color.primary,
 *     '&:hover': { backgroundColor: token.color['primary-foreground'] },
 *     '@media (min-width: 768px)': { padding: token.spacing[6] },
 *   },
 * });
 * ```
 */

import { getSSRContext } from '../ssr/ssr-render-context';
import { generateClassName } from './class-generator';
import type { StrictBlockValue, StyleBlock } from './style-block';
import { isToken } from './token';
import { UNITLESS_PROPERTIES } from './unitless-properties';

/** A single CSS property/value pair emitted by the renderer. */
interface CSSDeclaration {
  property: string;
  value: string;
}

/** Input to css(): a record of named style blocks (object form only). */
export type CSSInput = Record<string, StyleBlock>;

/**
 * Output of css(): block names as top-level properties, plus non-enumerable `css`.
 *
 * Generic constraint is intentionally loose (`Record<string, unknown>`) because
 * CSSOutput only uses `keyof T` to map names to class strings — it never inspects
 * the block values themselves.
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
export function css<const T extends CSSInput>(
  input: {
    [K in keyof T]: K extends 'css' ? never : StrictBlockValue<T[K]>;
  },
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

  for (const [blockName, blockValue] of Object.entries(input as CSSInput)) {
    const styleFingerprint = useFingerprint ? serializeBlock(blockValue) : '';
    const className = generateClassName(filePath, blockName, styleFingerprint);
    classNames[blockName] = className;
    cssRules.push(...renderStyleBlock(blockValue, `.${className}`));
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

function isStyleBlock(value: unknown): value is StyleBlock {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isToken(value);
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
