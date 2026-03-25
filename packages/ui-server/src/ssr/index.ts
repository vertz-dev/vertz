/**
 * @vertz/ui-server/ssr — Production SSR entry point.
 *
 * Exports only SSR runtime code (no Vite/dev-server dependencies).
 * Use this in production builds (e.g., Cloudflare Workers) to avoid
 * bundling vite, rollup, esbuild, lightningcss, and fsevents.
 */

export { loadAotManifest } from '../aot-manifest-loader';
export type { PrerenderOptions, PrerenderResult } from '../prerender';
export {
  collectPrerenderPaths,
  discoverRoutes,
  filterPrerenderableRoutes,
  prerenderRoutes,
  stripScriptsFromStaticHTML,
} from '../prerender';
export type { AotManifest } from '../ssr-aot-pipeline';
export type { SSRHandlerOptions } from '../ssr-handler';
export { createSSRHandler } from '../ssr-handler';
export type {
  SSRDiscoverResult,
  SSRModule,
  SSRRenderResult,
} from '../ssr-render';
export { ssrDiscoverQueries, ssrRenderToString } from '../ssr-render';
export { injectIntoTemplate } from '../template-inject';
