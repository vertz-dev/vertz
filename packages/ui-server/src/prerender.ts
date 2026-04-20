/**
 * Static pre-rendering pipeline.
 *
 * Discovers routes from an SSR module and pre-renders them to HTML
 * at build time. Used by `vertz build` to generate static HTML files.
 */

import type { CompiledRoute, FontFallbackMetrics } from '@vertz/ui';
import type { SSRModule, SSRRenderResult } from './ssr-shared';
import { ssrRenderSinglePass } from './ssr-single-pass';
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
  /** Pre-computed font fallback metrics for zero-CLS font loading. */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
  /**
   * Per-route error callback. When provided, pre-rendering a broken route
   * is reported via this callback and the loop continues with the remaining
   * routes instead of aborting the whole build. The caller decides whether
   * to warn or fail based on accumulated errors.
   */
  onRouteError?: (path: string, error: Error) => void;
}

/**
 * Discover all route patterns from an SSR module.
 *
 * Renders `/` to trigger `createRouter()`, which registers route patterns
 * with the SSR context. Returns the discovered patterns (including dynamic).
 *
 * Falls back to walking the exported `routes` array if rendering `/` fails
 * (e.g. because a component at `/` throws under SSR). The runtime-discovery
 * path has one failure mode — if the shared layout for `/` breaks, we lose
 * the whole route map — while the static walk doesn't exercise components,
 * so the remaining routes can still be pre-rendered.
 */
export async function discoverRoutes(module: SSRModule): Promise<string[]> {
  try {
    const result = await ssrRenderSinglePass(module, '/');
    if (result.discoveredRoutes && result.discoveredRoutes.length > 0) {
      return result.discoveredRoutes;
    }
  } catch {
    // Fall through to static walk
  }
  if (module.routes) {
    return collectRoutePatterns(module.routes);
  }
  return [];
}

/**
 * Walk a CompiledRoute[] tree and return every pattern (static + dynamic),
 * qualified with parent prefixes. Unlike `collectPrerenderPaths`, this does
 * NOT filter by `prerender` / `generateParams` — it returns the raw patterns
 * so the caller can reuse `filterPrerenderableRoutes`.
 */
function collectRoutePatterns(routes: CompiledRoute[], prefix = ''): string[] {
  const patterns: string[] = [];
  for (const route of routes) {
    const fullPattern = joinPatterns(prefix, route.pattern);
    patterns.push(fullPattern);
    if (route.children) {
      patterns.push(...collectRoutePatterns(route.children, fullPattern));
    }
  }
  return patterns;
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
 * CSS from SSR (theme variables, font-face, global styles) is injected as
 * inline `<style>` tags. The template's `<link>` tags only cover component
 * CSS extracted by the bundler — theme and globals are computed at render time.
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
      renderResult = await ssrRenderSinglePass(module, routePath, {
        fallbackMetrics: options.fallbackMetrics,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const wrapped = new Error(
        `Pre-render failed for ${routePath}\n` +
          `  ${err.message}\n` +
          '  Hint: If this route requires runtime data, add `prerender: false` to its route config.',
      );
      if (options.onRouteError) {
        options.onRouteError(routePath, wrapped);
        continue;
      }
      throw wrapped;
    }

    const html = injectIntoTemplate({
      template,
      appHtml: renderResult.html,
      appCss: renderResult.css,
      ssrData: renderResult.ssrData,
      nonce: options.nonce,
      headTags: renderResult.headTags || undefined,
    });

    results.push({ path: routePath, html });
  }

  return results;
}

/**
 * Strip `<script>` tags and `<link rel="modulepreload">` from pre-rendered HTML
 * that has no interactive components (no `data-v-island` or `data-v-id` markers).
 *
 * Pages with islands or hydrated components need the client JS; purely static
 * pages (like /manifesto) ship zero JavaScript.
 */
export function stripScriptsFromStaticHTML(html: string): string {
  if (html.includes('data-v-island') || html.includes('data-v-id')) {
    return html;
  }
  // Strip <script ...>...</script> and self-closing <script ... />
  let result = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<script\b[^>]*\/>/gi, '');
  // Strip <link rel="modulepreload" ...> (self-closing or not)
  result = result.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\/?>/gi, '');
  return result;
}

/**
 * Collect all paths that should be pre-rendered from compiled routes.
 *
 * Walks the route tree and collects:
 * - Static routes with `prerender: true`
 * - Dynamic routes with `generateParams` (expanded to concrete paths)
 * - Skips routes with `prerender: false`
 * - Routes without `prerender` or `generateParams` are not collected
 */
export async function collectPrerenderPaths(
  routes: CompiledRoute[],
  prefix = '',
): Promise<string[]> {
  const paths: string[] = [];

  for (const route of routes) {
    const fullPattern = joinPatterns(prefix, route.pattern);
    const optedOut = route.prerender === false;

    // Collect this route's paths (unless opted out)
    if (!optedOut) {
      if (route.generateParams) {
        // Dynamic route with generateParams — expand to concrete paths
        const paramSets = await route.generateParams();
        for (const params of paramSets) {
          let path = fullPattern;
          for (const [key, value] of Object.entries(params)) {
            path = path.replaceAll(`:${key}`, value);
          }
          // Validate all params were replaced
          const unreplaced = path.match(/:(\w+)/);
          if (unreplaced) {
            throw new Error(
              `generateParams for "${fullPattern}" returned params missing key "${unreplaced[1]}"`,
            );
          }
          paths.push(path);
        }
      } else if (route.prerender === true) {
        // Static route with explicit prerender: true
        paths.push(fullPattern);
      }
    }

    // Always recurse into children — parent prerender: false only affects the parent,
    // not its children (a layout route may opt out while its pages opt in)
    if (route.children) {
      const childPaths = await collectPrerenderPaths(route.children, fullPattern);
      paths.push(...childPaths);
    }
  }

  return paths;
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
