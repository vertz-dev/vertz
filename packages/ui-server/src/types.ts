/** A raw HTML string that bypasses escaping during serialization. */
export interface RawHtml {
  __raw: true;
  html: string;
}

/** Create a raw HTML string that will not be escaped during serialization. */
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

/** Options for {@link renderToStream}. */
export interface RenderToStreamOptions {
  /**
   * CSP nonce to inject on all inline `<script>` tags emitted during SSR.
   *
   * When set, every inline script (e.g. Suspense replacement scripts) will
   * include `nonce="<value>"` so that strict Content-Security-Policy headers
   * do not block them.
   */
  nonce?: string;
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
