export type { FallbackFontName, FontFallbackMetrics } from '@vertz/ui';
export { compile, compileForSsrAot, loadNativeCompiler } from './compiler/native-compiler';
export type {
  NativeCompileOptions,
  NativeCompileResult,
  NativeCompiler,
} from './compiler/native-compiler';
export { createVertzLibraryPlugin } from './compiler/library-plugin';
export type { VertzLibraryPluginOptions } from './compiler/library-plugin';
export type { ExtractedRoute } from './compiler/prefetch-manifest';
export { extractRoutes } from './compiler/prefetch-manifest';
export type {
  AotBarrelResult,
  AotBuildComponentEntry,
  AotBuildManifest,
  AotCompiledFile,
  AotRouteMapEntry,
} from './aot-manifest-build';
export {
  attachPerRouteCss,
  buildAotRouteMap,
  findAppComponent,
  generateAotBarrel,
  generateAotBuildManifest,
} from './aot-manifest-build';
export { loadAotManifest } from './aot-manifest-loader';
export { renderAssetTags } from './asset-pipeline';
export { inlineCriticalCss } from './critical-css';
export { toVNode } from './dom-shim';
export { detectFallbackFont, extractFontMetrics } from './font-metrics';
export { HeadCollector, renderHeadToHtml } from './head';
export { serializeToHtml } from './html-serializer';
export { wrapWithHydrationMarkers } from './hydration-markers';
export type { NodeHandlerOptions } from './node-handler';
export { createNodeHandler } from './node-handler';
export type { PageOptions } from './render-page';
export { renderPage } from './render-page';
export type { RenderToHTMLOptions, RenderToHTMLStreamOptions } from './render-to-html';
export { renderToHTML, renderToHTMLStream } from './render-to-html';
export { renderToStream } from './render-to-stream';
export { createSlotPlaceholder, resetSlotCounter } from './slot-placeholder';
export type { PrefetchSession, SerializedAccessRule } from './ssr-access-evaluator';
export { evaluateAccessRule, toPrefetchSession } from './ssr-access-evaluator';
export { createAccessSetScript, getAccessSetForSSR } from './ssr-access-set';
export { createSSRAdapter } from './ssr-adapter';
export type {
  AotComponentDiagnostic,
  AotDiagnosticsSnapshot,
  AotDivergenceEntry,
  AotTier,
} from './ssr-aot-diagnostics';
export { AotDiagnostics } from './ssr-aot-diagnostics';
export type {
  AotDevComponentEntry,
  AotDevManifest,
  AotManifestManager,
  AotManifestManagerOptions,
  AotManifestSnapshot,
} from './ssr-aot-manifest-dev';
export { createAotManifestManager } from './ssr-aot-manifest-dev';
export type {
  AotDataResolver,
  AotManifest,
  AotRenderFn,
  AotRouteEntry,
  SSRAotContext,
  SSRRenderAotOptions,
} from './ssr-aot-pipeline';
export {
  clearRouteCssCache,
  createHoles,
  isAotDebugEnabled,
  ssrRenderAot,
} from './ssr-aot-pipeline';
export { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from './ssr-aot-runtime';
export type { SSRQueryEntry } from './ssr-context';
export {
  clearGlobalSSRTimeout,
  getGlobalSSRTimeout,
  getSSRQueries,
  getSSRUrl,
  isInSSR,
  registerSSRQuery,
  setGlobalSSRTimeout,
  ssrStorage,
} from './ssr-context';
export type { SSRHandlerOptions } from './ssr-handler';
export { createSSRHandler } from './ssr-handler';
export type { GenerateSSRHtmlOptions } from './ssr-html';
export { generateSSRHtml } from './ssr-html';
export type { ReconstructedDescriptor } from './ssr-manifest-prefetch';
export { reconstructDescriptors } from './ssr-manifest-prefetch';
export type {
  PrefetchManifestManager,
  PrefetchManifestManagerOptions,
  PrefetchManifestSnapshot,
} from './ssr-prefetch-dev';
export { createPrefetchManifestManager } from './ssr-prefetch-dev';
export type { SSRModule, SSRRenderResult } from './ssr-shared';
export type { MatchedRoute, MatchOptions } from './ssr-route-matcher';
export { matchUrlToPatterns } from './ssr-route-matcher';
export type { SessionData, SessionResolver, SSRSessionInfo } from './ssr-session';
export { createSessionScript } from './ssr-session';
export type { EntityAccessMap, SSRPrefetchManifest, SSRSinglePassOptions } from './ssr-single-pass';
export { ssrRenderSinglePass, ssrStreamNavQueries } from './ssr-single-pass';
export {
  createSSRDataChunk,
  getStreamingRuntimeScript,
  safeSerialize,
} from './ssr-streaming-runtime';
export { collectStreamChunks, encodeChunk, streamToString } from './streaming';
export { createTemplateChunk } from './template-chunk';
export type {
  AssetDescriptor,
  HeadEntry,
  HydrationOptions,
  RawHtml,
  RenderToStreamOptions,
  VNode,
} from './types';
export { rawHtml } from './types';
