/**
 * Production SSR request handler.
 *
 * Creates a web-standard (Request) => Promise<Response> handler that:
 * - Renders SSR HTML for normal page requests
 * - Streams SSE query data for nav pre-fetch requests (X-Vertz-Nav: 1)
 *
 * Does NOT serve static files — that's the adapter/platform's job.
 */

import type { FontFallbackMetrics, PreloadItem } from '@vertz/ui';
import type { SSRAuth } from '@vertz/ui/internals';
import { escapeAttr } from './html-serializer';
import { createAccessSetScript } from './ssr-access-set';
import { compileThemeCached, type SSRModule, ssrStreamNavQueries } from './ssr-render';
import type { SessionResolver } from './ssr-session';
import { createSessionScript } from './ssr-session';
import type { SSRPrefetchManifest } from './ssr-single-pass';
import { ssrRenderSinglePass } from './ssr-single-pass';
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
}

/**
 * Sanitize a URL for use in an HTTP Link header href.
 * Encodes characters that are meaningful in Link header syntax (<, >, ;, ,)
 * to prevent header injection attacks.
 */
function sanitizeLinkHref(href: string): string {
  return href.replace(/[<>,;\s"']/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Sanitize a parameter value for Link header (alphanumeric + / only). */
function sanitizeLinkParam(value: string): string {
  return value.replace(/[^a-zA-Z0-9/_.-]/g, '');
}

/** Build an HTTP Link header value from structured preload items. */
function buildLinkHeader(items: PreloadItem[]): string {
  return items
    .map((item) => {
      const parts = [
        `<${sanitizeLinkHref(item.href)}>`,
        'rel=preload',
        `as=${sanitizeLinkParam(item.as)}`,
      ];
      if (item.type) parts.push(`type=${sanitizeLinkParam(item.type)}`);
      if (item.crossorigin) parts.push('crossorigin');
      return parts.join('; ');
    })
    .join(', ');
}

/**
 * Create a web-standard SSR request handler.
 *
 * Handles two types of requests:
 * - X-Vertz-Nav: 1 -> SSE Response with pre-fetched query data
 * - Normal HTML request -> SSR-rendered HTML Response
 *
 * Does NOT serve static files — that's the adapter/platform's job.
 */

/** Build modulepreload `<link>` tags for injection into `<head>`. */
function buildModulepreloadTags(paths: string[]): string {
  return paths.map((p) => `<link rel="modulepreload" href="${escapeAttr(p)}">`).join('\n');
}

export function createSSRHandler(
  options: SSRHandlerOptions,
): (request: Request) => Promise<Response> {
  const {
    module,
    ssrTimeout,
    inlineCSS,
    nonce,
    fallbackMetrics,
    modulepreload,
    routeChunkManifest,
    cacheControl,
    sessionResolver,
    manifest,
  } = options;

  // Pre-process template: inline CSS assets to eliminate extra requests
  let template = options.template;
  if (inlineCSS) {
    for (const [href, css] of Object.entries(inlineCSS)) {
      const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkPattern = new RegExp(`<link[^>]*href=["']${escapedHref}["'][^>]*>`);
      const safeCss = css.replace(/<\//g, '<\\/');
      template = template.replace(linkPattern, `<style data-vertz-css>${safeCss}</style>`);
    }
  }

  // Pre-compute Link header from theme's preload items (computed once, not per-request)
  let linkHeader: string | undefined;
  if (module.theme) {
    const compiled = compileThemeCached(module.theme, fallbackMetrics);
    if (compiled.preloadItems.length > 0) {
      linkHeader = buildLinkHeader(compiled.preloadItems);
    }
  }

  // Pre-compute modulepreload tags (static, computed once)
  const modulepreloadTags = modulepreload?.length
    ? buildModulepreloadTags(modulepreload)
    : undefined;

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
      try {
        const sessionResult = await sessionResolver(request);
        if (sessionResult) {
          ssrAuth = {
            status: 'authenticated',
            user: sessionResult.session.user,
            expiresAt: sessionResult.session.expiresAt,
          };
          const scripts: string[] = [];
          scripts.push(createSessionScript(sessionResult.session, nonce));
          if (sessionResult.accessSet != null) {
            scripts.push(createAccessSetScript(sessionResult.accessSet, nonce));
          }
          sessionScript = scripts.join('\n');
        } else {
          ssrAuth = { status: 'unauthenticated' };
        }
      } catch (resolverErr) {
        // ssrAuth stays undefined → auth unknown during SSR → no redirect
        console.warn(
          '[Server] Session resolver failed:',
          resolverErr instanceof Error ? resolverErr.message : resolverErr,
        );
      }
    }

    // Normal HTML request: SSR render
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
): Promise<Response> {
  try {
    const result = await ssrRenderSinglePass(module, url, {
      ssrTimeout,
      fallbackMetrics,
      ssrAuth,
      manifest,
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
    let modulepreloadTags = staticModulepreloadTags;
    if (routeChunkManifest && result.matchedRoutePatterns?.length) {
      const chunkPaths = new Set<string>();
      for (const pattern of result.matchedRoutePatterns) {
        const chunks = routeChunkManifest.routes[pattern];
        if (chunks) {
          for (const chunk of chunks) {
            chunkPaths.add(chunk);
          }
        }
      }
      if (chunkPaths.size > 0) {
        modulepreloadTags = buildModulepreloadTags([...chunkPaths]);
      }
    }

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
