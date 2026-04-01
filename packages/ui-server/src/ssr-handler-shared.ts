/**
 * Shared utilities for SSR request handlers.
 *
 * Used by both the web-standard handler (ssr-handler.ts) and the
 * native Node handler (node-handler.ts).
 */

import type { PreloadItem } from '@vertz/ui';
import type { SSRAuth } from '@vertz/ui/internals';
import { escapeAttr } from './html-serializer';
import { createAccessSetScript } from './ssr-access-set';
import type { SSRHandlerOptions } from './ssr-handler';
import { compileThemeCached } from './ssr-shared';
import type { SessionResolver } from './ssr-session';
import { createSessionScript } from './ssr-session';
import { splitTemplate } from './template-split';

/**
 * Sanitize a URL for use in an HTTP Link header href.
 * Encodes characters that are meaningful in Link header syntax (<, >, ;, ,)
 * to prevent header injection attacks.
 */
export function sanitizeLinkHref(href: string): string {
  return href.replace(/[<>,;\s"']/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Sanitize a parameter value for Link header (alphanumeric + / only). */
export function sanitizeLinkParam(value: string): string {
  return value.replace(/[^a-zA-Z0-9/_.-]/g, '');
}

/** Build an HTTP Link header value from structured preload items. */
export function buildLinkHeader(items: PreloadItem[]): string {
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

/** Build modulepreload `<link>` tags for injection into `<head>`. */
export function buildModulepreloadTags(paths: string[]): string {
  return paths.map((p) => `<link rel="modulepreload" href="${escapeAttr(p)}">`).join('\n');
}

/** Resolve per-route modulepreload tags from matched route patterns. */
export function resolveRouteModulepreload(
  routeChunkManifest: { routes: Record<string, string[]> } | undefined,
  matchedPatterns: string[] | undefined,
  fallback: string | undefined,
): string | undefined {
  if (routeChunkManifest && matchedPatterns?.length) {
    const chunkPaths = new Set<string>();
    for (const pattern of matchedPatterns) {
      const chunks = routeChunkManifest.routes[pattern];
      if (chunks) {
        for (const chunk of chunks) {
          chunkPaths.add(chunk);
        }
      }
    }
    if (chunkPaths.size > 0) {
      return buildModulepreloadTags([...chunkPaths]);
    }
  }
  return fallback;
}

/** Pre-process a template by inlining CSS assets. */
export function preprocessInlineCSS(template: string, inlineCSS: Record<string, string>): string {
  let result = template;
  for (const [href, css] of Object.entries(inlineCSS)) {
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkPattern = new RegExp(`<link[^>]*href=["']${escapedHref}["'][^>]*>`);
    const safeCss = css.replace(/<\//g, '<\\/');
    result = result.replace(linkPattern, `<style data-vertz-css>${safeCss}</style>`);
  }
  return result;
}

/**
 * Pre-computed values shared between handler types.
 * Computed once at handler creation, reused for every request.
 */
export interface PrecomputedHandlerState {
  template: string;
  linkHeader: string | undefined;
  modulepreloadTags: string | undefined;
  splitResult: { headTemplate: string; tailTemplate: string } | undefined;
}

/** Pre-compute shared state from handler options. Runs once at creation time. */
export function precomputeHandlerState(options: SSRHandlerOptions): PrecomputedHandlerState {
  const { module, inlineCSS, fallbackMetrics, modulepreload, progressiveHTML } = options;

  // Pre-process template: inline CSS assets
  let template = options.template;
  if (inlineCSS) {
    template = preprocessInlineCSS(template, inlineCSS);
  }

  // Pre-compute Link header from theme's preload items
  let linkHeader: string | undefined;
  if (module.theme) {
    const compiled = compileThemeCached(module.theme, fallbackMetrics);
    if (compiled.preloadItems.length > 0) {
      linkHeader = buildLinkHeader(compiled.preloadItems);
    }
  }

  // Pre-compute modulepreload tags
  const modulepreloadTags = modulepreload?.length
    ? buildModulepreloadTags(modulepreload)
    : undefined;

  // Pre-split template for progressive streaming
  const splitResult = progressiveHTML ? splitTemplate(template) : undefined;

  // Convert stylesheet links to async loading for progressive path
  if (splitResult && module.theme) {
    splitResult.headTemplate = splitResult.headTemplate.replace(
      /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g,
      (match, href) =>
        `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'">\n    <noscript>${match}</noscript>`,
    );
  }

  return { template, linkHeader, modulepreloadTags, splitResult };
}

/**
 * Resolve session from a web Request.
 * Returns session script HTML and SSRAuth for SSR rendering.
 */
export async function resolveSession(
  request: Request,
  sessionResolver: SessionResolver,
  nonce?: string,
): Promise<{ sessionScript: string; ssrAuth: SSRAuth | undefined }> {
  let sessionScript = '';
  let ssrAuth: SSRAuth | undefined;

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

  return { sessionScript, ssrAuth };
}
