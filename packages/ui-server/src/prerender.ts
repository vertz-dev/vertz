/**
 * Static pre-rendering pipeline.
 *
 * Discovers routes from an SSR module and pre-renders them to HTML
 * at build time. Used by `vertz build` to generate static HTML files.
 */

import type { CompiledRoute } from '@vertz/ui';
import type { SSRModule, SSRRenderResult } from './ssr-render';
import { ssrRenderToString } from './ssr-render';
import { injectIntoTemplate } from './template-inject';

export interface PrerenderResult {
  /** The route path that was pre-rendered. */
  path: string;
  /** The complete HTML string. */
  html: string;
}

export interface PrerenderOptions {
  /** Route paths to pre-render. */
  routes: string[];
  /** CSP nonce for inline scripts. */
  nonce?: string;
}

/**
 * Discover all route patterns from an SSR module.
 *
 * Renders `/` to trigger `createRouter()`, which registers route patterns
 * with the SSR context. Returns the discovered patterns (including dynamic).
 */
export async function discoverRoutes(module: SSRModule): Promise<string[]> {
  const result = await ssrRenderToString(module, '/');
  return result.discoveredRoutes ?? [];
}

/**
 * Filter route patterns to only pre-renderable ones.
 *
 * Excludes:
 * - Routes with `:param` segments
 * - Routes with `*` wildcard
 * - Routes with `prerender: false` (looked up in compiledRoutes)
 */
export function filterPrerenderableRoutes(
  patterns: string[],
  compiledRoutes?: CompiledRoute[],
): string[] {
  return patterns.filter((pattern) => {
    // Skip dynamic segments
    if (pattern.includes(':') || pattern.includes('*')) return false;
    // Skip routes with prerender: false
    if (compiledRoutes) {
      const route = findCompiledRoute(compiledRoutes, pattern);
      if (route?.prerender === false) return false;
    }
    return true;
  });
}

/**
 * Pre-render a list of routes into complete HTML strings.
 *
 * Routes are rendered sequentially (not in parallel) because the DOM shim
 * uses process-global `document`/`window`. Concurrent renders would interleave.
 *
 * CSS is deliberately NOT injected as inline `<style>` tags — the template
 * already has `<link>` tags pointing to the CSS files. This avoids duplication.
 *
 * @throws Error if any route fails to render (with hint about `prerender: false`)
 */
export async function prerenderRoutes(
  module: SSRModule,
  template: string,
  options: PrerenderOptions,
): Promise<PrerenderResult[]> {
  const results: PrerenderResult[] = [];

  for (const routePath of options.routes) {
    let renderResult: SSRRenderResult;
    try {
      renderResult = await ssrRenderToString(module, routePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Pre-render failed for ${routePath}\n` +
          `  ${message}\n` +
          '  Hint: If this route requires runtime data, add `prerender: false` to its route config.',
      );
    }

    // Inject HTML into template, passing empty CSS to avoid duplication
    // (template already has <link> to CSS files)
    const html = injectIntoTemplate(
      template,
      renderResult.html,
      /* css: */ '',
      renderResult.ssrData,
      options.nonce,
      renderResult.headTags || undefined,
    );

    results.push({ path: routePath, html });
  }

  return results;
}

/** Find a compiled route by pattern (recursive through children). */
function findCompiledRoute(
  routes: CompiledRoute[],
  pattern: string,
  prefix = '',
): CompiledRoute | undefined {
  for (const route of routes) {
    const fullPattern = joinPatterns(prefix, route.pattern);
    if (fullPattern === pattern) return route;
    if (route.children) {
      const found = findCompiledRoute(route.children, pattern, fullPattern);
      if (found) return found;
    }
  }
  return undefined;
}

/** Join parent and child route patterns. */
function joinPatterns(parent: string, child: string): string {
  if (!parent || parent === '/') return child;
  if (child === '/') return parent;
  return `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`;
}
