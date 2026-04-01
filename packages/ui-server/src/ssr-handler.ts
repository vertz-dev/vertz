/**
 * Production SSR request handler.
 *
 * Creates a web-standard (Request) => Promise<Response> handler that:
 * - Renders SSR HTML for normal page requests
 * - Streams SSE query data for nav pre-fetch requests (X-Vertz-Nav: 1)
 *
 * Does NOT serve static files — that's the adapter/platform's job.
 */

import type { FontFallbackMetrics } from '@vertz/ui';
import type { SSRAuth } from '@vertz/ui/internals';
import { toPrefetchSession } from './ssr-access-evaluator';
import type { AotDataResolver, AotManifest } from './ssr-aot-pipeline';
import { ssrRenderAot } from './ssr-aot-pipeline';
import {
  precomputeHandlerState,
  resolveRouteModulepreload,
  resolveSession,
} from './ssr-handler-shared';
import { buildProgressiveResponse } from './ssr-progressive-response';
import type { SSRModule } from './ssr-shared';
import type { SSRPrefetchManifest } from './ssr-single-pass';
import {
  ssrRenderProgressive,
  ssrRenderSinglePass,
  ssrStreamNavQueries,
} from './ssr-single-pass';
import { injectIntoTemplate } from './template-inject';

export interface SSRHandlerOptions {
  /** The loaded SSR module (import('./dist/server/index.js')) */
  module: SSRModule;
  /** HTML template string (contents of dist/client/index.html) */
  template: string;
  /** SSR timeout for queries (default: 300ms) */
  ssrTimeout?: number;
  /**
   * Map of CSS asset URLs to their content for inlining.
   * Replaces `<link rel="stylesheet" href="...">` tags with inline `<style>` tags.
   * Eliminates extra network requests, preventing FOUC on slow connections.
   *
   * @example
   * ```ts
   * inlineCSS: { '/assets/vertz.css': await Bun.file('./dist/client/assets/vertz.css').text() }
   * ```
   */
  inlineCSS?: Record<string, string>;
  /**
   * CSP nonce to inject on all inline `<script>` tags emitted during SSR.
   *
   * When set, the SSR data hydration script will include `nonce="<value>"`
   * so that strict Content-Security-Policy headers do not block it.
   */
  nonce?: string;
  /** Pre-computed font fallback metrics (computed at server startup). */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
  /** Paths to inject as `<link rel="modulepreload">` in `<head>`. */
  modulepreload?: string[];
  /**
   * Route chunk manifest for per-route modulepreload injection.
   * When provided, only chunks for the matched route are preloaded instead of all chunks.
   */
  routeChunkManifest?: { routes: Record<string, string[]> };
  /** Cache-Control header for HTML responses. Omit or undefined = no header (safe default). */
  cacheControl?: string;
  /**
   * Resolves session data from request cookies for SSR injection.
   * When provided, SSR HTML includes `window.__VERTZ_SESSION__` and
   * optionally `window.__VERTZ_ACCESS_SET__` for instant auth hydration.
   */
  sessionResolver?: SessionResolver;
  /**
   * Prefetch manifest for single-pass SSR optimization.
   *
   * When provided with route entries and an API client export, enables
   * zero-discovery rendering — queries are prefetched from the manifest
   * without executing the component tree, then a single render pass
   * produces the HTML. Without a manifest, SSR still uses the single-pass
   * discovery-then-render approach (cheaper than two-pass).
   */
  manifest?: SSRPrefetchManifest;
  /**
   * Enable progressive HTML streaming. Default: false.
   *
   * When true, the Response body is a ReadableStream that sends `<head>`
   * content (CSS, preloads, fonts) before `<body>` rendering is complete.
   * This improves TTFB and FCP.
   *
   * Has no effect on zero-discovery routes (manifest with routeEntries),
   * which always use buffered rendering.
   */
  progressiveHTML?: boolean;
  /**
   * AOT manifest with pre-compiled render functions.
   *
   * When provided, routes matching AOT entries are rendered via string-builder
   * functions (no DOM shim), bypassing the reactive runtime for 4-6x speedup.
   * Routes not in the manifest fall back to `ssrRenderSinglePass()`.
   *
   * Load via `loadAotManifest(serverDir)` at startup.
   */
  aotManifest?: AotManifest;
  /**
   * Custom data resolver for AOT routes with non-entity data sources.
   *
   * Called after entity prefetch, with only the unresolved query keys.
   * Enables AOT rendering for routes that use custom data layers
   * (JSON files, third-party APIs, custom DB clients).
   */
  aotDataResolver?: AotDataResolver;
}

import type { SessionResolver } from './ssr-session';

export function createSSRHandler(
  options: SSRHandlerOptions,
): (request: Request) => Promise<Response> {
  const {
    module,
    ssrTimeout,
    nonce,
    fallbackMetrics,
    routeChunkManifest,
    cacheControl,
    sessionResolver,
    manifest,
    progressiveHTML,
    aotManifest,
    aotDataResolver,
  } = options;

  const { template, linkHeader, modulepreloadTags, splitResult } = precomputeHandlerState(options);

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Nav pre-fetch: SSE response — session resolver NOT called
    if (request.headers.get('x-vertz-nav') === '1') {
      return handleNavRequest(module, pathname, ssrTimeout);
    }

    // Resolve session in isolated try/catch (graceful degradation)
    let sessionScript = '';
    let ssrAuth: SSRAuth | undefined;
    if (sessionResolver) {
      const result = await resolveSession(request, sessionResolver, nonce);
      sessionScript = result.sessionScript;
      ssrAuth = result.ssrAuth;
    }

    // Extract request cookies so document.cookie works during SSR
    const cookies = request.headers.get('Cookie') ?? undefined;

    // Normal HTML request: SSR render
    // Progressive streaming: use streaming path when enabled and NOT zero-discovery.
    // Zero-discovery routes always use buffered rendering (redirect safety — see design doc).
    const useProgressive =
      progressiveHTML &&
      splitResult &&
      !(manifest?.routeEntries && Object.keys(manifest.routeEntries).length > 0);

    if (useProgressive) {
      return handleProgressiveHTMLRequest(
        module,
        splitResult,
        pathname + url.search,
        ssrTimeout,
        nonce,
        fallbackMetrics,
        linkHeader,
        modulepreloadTags,
        routeChunkManifest,
        cacheControl,
        sessionScript,
        ssrAuth,
        manifest,
        cookies,
      );
    }

    return handleHTMLRequest(
      module,
      template,
      pathname + url.search,
      ssrTimeout,
      nonce,
      fallbackMetrics,
      linkHeader,
      modulepreloadTags,
      routeChunkManifest,
      cacheControl,
      sessionScript,
      ssrAuth,
      manifest,
      aotManifest,
      aotDataResolver,
      cookies,
    );
  };
}

/**
 * Handle a nav pre-fetch request.
 * Streams SSE events as each query settles (data or pending).
 */
async function handleNavRequest(
  module: SSRModule,
  url: string,
  ssrTimeout?: number,
): Promise<Response> {
  try {
    const stream = await ssrStreamNavQueries(module, url, { ssrTimeout });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    // Graceful degradation — still send done event so client falls back
    return new Response('event: done\ndata: {}\n\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }
}

/**
 * Handle a progressive HTML page request.
 * Streams <head> before <body> rendering completes.
 */
async function handleProgressiveHTMLRequest(
  module: SSRModule,
  split: { headTemplate: string; tailTemplate: string },
  url: string,
  ssrTimeout?: number,
  nonce?: string,
  fallbackMetrics?: Record<string, FontFallbackMetrics>,
  linkHeader?: string,
  staticModulepreloadTags?: string,
  routeChunkManifest?: { routes: Record<string, string[]> },
  cacheControl?: string,
  sessionScript?: string,
  ssrAuth?: SSRAuth,
  manifest?: SSRPrefetchManifest,
  cookies?: string,
): Promise<Response> {
  try {
    const result = await ssrRenderProgressive(module, url, {
      ssrTimeout,
      fallbackMetrics,
      ssrAuth,
      manifest,
      cookies,
    });

    // SSR redirect — return 302 without streaming
    if (result.redirect) {
      return new Response(null, {
        status: 302,
        headers: { Location: result.redirect.to },
      });
    }

    // Per-route modulepreload: resolve from matched route patterns (available after discovery)
    const modulepreloadTags = resolveRouteModulepreload(
      routeChunkManifest,
      result.matchedRoutePatterns,
      staticModulepreloadTags,
    );

    // Build head chunk: template head + CSS + modulepreload + session
    // Inject before </head> in the headTemplate
    let headChunk = split.headTemplate;
    const headCloseIdx = headChunk.lastIndexOf('</head>');
    if (headCloseIdx !== -1) {
      const injections: string[] = [];
      if (result.css) injections.push(result.css);
      if (result.headTags) injections.push(result.headTags);
      if (modulepreloadTags) injections.push(modulepreloadTags);
      if (sessionScript) injections.push(sessionScript);

      if (injections.length > 0) {
        headChunk =
          headChunk.slice(0, headCloseIdx) +
          injections.join('\n') +
          '\n' +
          headChunk.slice(headCloseIdx);
      }
    } else {
      // No </head> in head template — append injections at the end
      if (result.css) headChunk += result.css;
      if (result.headTags) headChunk += result.headTags;
      if (modulepreloadTags) headChunk += modulepreloadTags;
      if (sessionScript) headChunk += sessionScript;
    }

    // Build response headers
    const headers: Record<string, string> = {};
    if (linkHeader) headers.Link = linkHeader;
    if (cacheControl) headers['Cache-Control'] = cacheControl;

    return buildProgressiveResponse({
      headChunk,
      renderStream: result.renderStream!,
      tailChunk: split.tailTemplate,
      ssrData: result.ssrData,
      nonce,
      headers,
    });
  } catch (err) {
    console.error('[SSR] Render failed:', err instanceof Error ? err.message : err);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Handle a normal HTML page request.
 * Renders the app via single-pass SSR (discovery → prefetch → render)
 * and injects into the template.
 */
async function handleHTMLRequest(
  module: SSRModule,
  template: string,
  url: string,
  ssrTimeout?: number,
  nonce?: string,
  fallbackMetrics?: Record<string, FontFallbackMetrics>,
  linkHeader?: string,
  staticModulepreloadTags?: string,
  routeChunkManifest?: { routes: Record<string, string[]> },
  cacheControl?: string,
  sessionScript?: string,
  ssrAuth?: SSRAuth,
  manifest?: SSRPrefetchManifest,
  aotManifest?: AotManifest,
  aotDataResolver?: AotDataResolver,
  cookies?: string,
): Promise<Response> {
  try {
    // Derive prefetch session from ssrAuth for access rule evaluation
    const prefetchSession = ssrAuth ? toPrefetchSession(ssrAuth) : undefined;

    // Use AOT rendering when an AOT manifest is available.
    // ssrRenderAot() falls back to ssrRenderSinglePass() for non-AOT routes.
    const result = aotManifest
      ? await ssrRenderAot(module, url, {
          aotManifest,
          manifest,
          ssrTimeout,
          fallbackMetrics,
          ssrAuth,
          prefetchSession,
          aotDataResolver,
          cookies,
        })
      : await ssrRenderSinglePass(module, url, {
          ssrTimeout,
          fallbackMetrics,
          ssrAuth,
          manifest,
          prefetchSession,
          cookies,
        });

    // SSR redirect — return 302 instead of rendered HTML
    if (result.redirect) {
      return new Response(null, {
        status: 302,
        headers: { Location: result.redirect.to },
      });
    }

    // Per-route modulepreload: if a manifest is available and SSR reported
    // matched patterns, inject only the chunks for those routes.
    // Falls back to the static (all-chunks) tags when no manifest or no match.
    const modulepreloadTags = resolveRouteModulepreload(
      routeChunkManifest,
      result.matchedRoutePatterns,
      staticModulepreloadTags,
    );

    // Combine head tags: font preloads + modulepreload links
    const allHeadTags = [result.headTags, modulepreloadTags].filter(Boolean).join('\n');

    const html = injectIntoTemplate({
      template,
      appHtml: result.html,
      appCss: result.css,
      ssrData: result.ssrData,
      nonce,
      headTags: allHeadTags || undefined,
      sessionScript,
    });

    const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
    if (linkHeader) headers.Link = linkHeader;
    if (cacheControl) headers['Cache-Control'] = cacheControl;

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('[SSR] Render failed:', err instanceof Error ? err.message : err);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
