/** A raw HTML string that bypasses escaping during serialization. */
export interface RawHtml {
  __raw: true;
  html: string;
}

/**
 * Create a raw HTML string that will NOT be escaped during SSR serialization.
 *
 * **WARNING: XSS RISK** — This function bypasses all HTML escaping. Never pass
 * user-controlled input directly. Always sanitize with a trusted library (e.g.
 * DOMPurify) before wrapping in `rawHtml()`.
 *
 * @example Safe usage
 * ```ts
 * rawHtml('<svg>...</svg>') // static markup — OK
 * rawHtml(DOMPurify.sanitize(userInput)) // sanitized — OK
 * ```
 *
 * @example Unsafe usage — NEVER do this
 * ```ts
 * rawHtml(userInput) // XSS vulnerability
 * rawHtml(`<div>${userInput}</div>`) // XSS via interpolation
 * ```
 */
export function rawHtml(html: string): RawHtml {
  return { __raw: true, html };
}

/** Virtual node representing an HTML element for SSR serialization. */
export interface VNode {
  tag: string;
  attrs: Record<string, string>;
  children: (VNode | string | RawHtml)[];
}

/** Options for hydration marker generation. */
export interface HydrationOptions {
  /** Component name for `data-v-id`. */
  componentName: string;
  /** Unique key for `data-v-key`. */
  key: string;
  /** Serialized props to embed as JSON. */
  props?: Record<string, unknown>;
}

/** Metadata collected by the Head component during rendering. */
export interface HeadEntry {
  tag: 'title' | 'meta' | 'link';
  attrs?: Record<string, string>;
  textContent?: string;
}

/** Asset descriptor for script/stylesheet injection. */
export interface AssetDescriptor {
  type: 'script' | 'stylesheet';
  src: string;
  /** Whether to add `async` attribute (scripts only). */
  async?: boolean;
  /** Whether to add `defer` attribute (scripts only). */
  defer?: boolean;
}
