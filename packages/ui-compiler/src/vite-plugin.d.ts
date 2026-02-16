import type { Plugin } from 'vite';
/** SSR configuration options. */
export interface SSROptions {
  /**
   * Path to the root component. Auto-detected from index.html if omitted.
   * @default auto-detect from <script type="module" src="..."> in index.html
   */
  entry?: string;
  /**
   * Streaming SSR vs buffered.
   * @default 'buffered'
   */
  mode?: 'buffered' | 'streaming';
  /**
   * Port override for the dev server (uses Vite's default if unset).
   */
  port?: number;
}
/** Options for the Vertz Vite plugin. */
export interface VertzPluginOptions {
  /** Glob patterns for component files. Defaults to tsx and jsx. */
  include?: string[];
  /** Glob patterns to exclude. */
  exclude?: string[];
  /** Enable CSS extraction in production. Defaults to true. */
  cssExtraction?: boolean;
  /** Route-to-file mapping for CSS code splitting (production only). */
  routeMap?: Map<string, string[]>;
  /**
   * Enable SSR in development mode.
   * When true, `vite dev` serves SSR'd HTML automatically.
   * When an object, provides SSR configuration options.
   */
  ssr?: boolean | SSROptions;
}
/**
 * Vite plugin that transforms tsx/jsx files using the vertz/ui compiler.
 *
 * Chains all compiler passes: reactive transforms, component transforms,
 * hydration markers, and CSS extraction. In dev mode, provides HMR for
 * both component code and CSS changes. In production, extracts CSS to
 * virtual modules and performs dead CSS elimination and route-level
 * code splitting.
 */
export default function vertzPlugin(options?: VertzPluginOptions): Plugin;
//# sourceMappingURL=vite-plugin.d.ts.map
