/**
 * Traffic-aware Pre-Rendering (TPR) for Cloudflare Workers.
 *
 * Queries Cloudflare zone analytics to identify hot pages,
 * then pre-renders them and stores the HTML in KV.
 */

import { storeCache } from './isr-cache.js';

export type { RouteClassification, RouteInfo } from './tpr-routes.js';
// Re-export route classification for Phase 3 (compiler-assisted TPR)
export { classifyRoutes } from './tpr-routes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A path with its request count from analytics. */
export interface TrafficEntry {
  path: string;
  requests: number;
}

/** Options for `analyzeTraffic()`. */
export interface AnalyzeTrafficOptions {
  /** Cloudflare zone ID. */
  zoneId: string;
  /** Cloudflare API token with Analytics:Read permission. */
  apiToken: string;
  /** Traffic lookback window. */
  lookback: '1h' | '6h' | '12h' | '24h' | '48h' | '7d';
  /** Pre-render pages covering this fraction of total traffic (0-1). */
  threshold: number;
  /** Maximum number of pages to pre-render. */
  maxPages: number;
  /** API base path to exclude from page paths. */
  apiBasePath: string;
  /** Optional fetch function for testing. Defaults to globalThis.fetch. */
  fetchFn?: typeof fetch;
}

/** Options for `preRenderPages()`. */
export interface PreRenderOptions {
  /** Paths to pre-render. */
  paths: string[];
  /** KV namespace for storing pre-rendered HTML. */
  kvNamespace: KVNamespace;
  /** SSR render function: takes a path, returns HTML string. */
  renderFn: (path: string) => Promise<string>;
  /** Maximum concurrent pre-renders. Default: 10. */
  concurrency?: number;
  /** Progress callback. */
  onProgress?: (rendered: number, total: number, path: string) => void;
}

/** Result of `preRenderPages()`. */
export interface PreRenderResult {
  /** Number of pages successfully pre-rendered. */
  rendered: number;
  /** Paths that failed to render. */
  failed: Array<{ path: string; error: string }>;
  /** Total duration in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Path filtering
// ---------------------------------------------------------------------------

/**
 * Filter traffic entries to only page paths.
 *
 * Excludes:
 * - API routes (matching apiBasePath prefix)
 * - Asset paths (/assets/, paths starting with /_)
 * - Paths with file extensions (.js, .css, .ico, etc.)
 */
export function filterPagePaths(entries: TrafficEntry[], apiBasePath: string): TrafficEntry[] {
  return entries.filter(({ path }) => {
    if (path.startsWith(apiBasePath)) return false;
    if (path.startsWith('/assets/')) return false;
    if (path.startsWith('/_')) return false;
    // Check for file extension (but not root path)
    if (path !== '/' && /\.\w{2,5}$/.test(path)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Hot path selection
// ---------------------------------------------------------------------------

/**
 * Select the most-trafficked paths that cover `threshold` of total traffic.
 *
 * Paths are sorted by request count descending. Accumulates until the
 * threshold fraction is reached or maxPages is hit.
 */
export function selectHotPaths(
  entries: TrafficEntry[],
  threshold: number,
  maxPages: number,
): string[] {
  if (entries.length === 0) return [];

  // Sort by requests descending
  const sorted = [...entries].sort((a, b) => b.requests - a.requests);
  const totalRequests = sorted.reduce((sum, e) => sum + e.requests, 0);
  const target = totalRequests * threshold;

  const result: string[] = [];
  let accumulated = 0;

  for (const entry of sorted) {
    if (result.length >= maxPages) break;
    if (accumulated >= target) break;
    result.push(entry.path);
    accumulated += entry.requests;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cloudflare Analytics API
// ---------------------------------------------------------------------------

/** Convert lookback string to a Date range. */
function lookbackToDateRange(lookback: AnalyzeTrafficOptions['lookback']): {
  since: string;
  until: string;
} {
  const now = new Date();
  const until = now.toISOString();
  const msMap: Record<string, number> = {
    '1h': 3600_000,
    '6h': 21600_000,
    '12h': 43200_000,
    '24h': 86400_000,
    '48h': 172800_000,
    '7d': 604800_000,
  };
  const since = new Date(now.getTime() - msMap[lookback]!).toISOString();
  return { since, until };
}

/**
 * Query Cloudflare zone analytics and return hot page paths.
 *
 * Uses the Cloudflare GraphQL Analytics API to fetch per-path request counts,
 * filters to page paths, and selects the paths covering `threshold` of traffic.
 */
export async function analyzeTraffic(options: AnalyzeTrafficOptions): Promise<string[]> {
  const {
    zoneId,
    apiToken,
    lookback,
    threshold,
    maxPages,
    apiBasePath,
    fetchFn = globalThis.fetch,
  } = options;

  const { since, until } = lookbackToDateRange(lookback);

  // Use httpRequests1hGroups for granular per-path data
  const query = `
    query GetTrafficByPath($zoneTag: string!, $since: Time!, $until: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1hGroups(
            limit: 10000
            filter: { datetime_geq: $since, datetime_lt: $until }
          ) {
            dimensions {
              datetime
            }
            sum {
              urlPathSummary {
                path
                requests
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetchFn('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { zoneTag: zoneId, since, until },
    }),
  });

  const json = (await response.json()) as {
    data?: {
      viewer: {
        zones: Array<{
          httpRequests1hGroups?: Array<{
            sum: {
              urlPathSummary?: Array<{ path: string; requests: number }>;
            };
          }>;
          httpRequests1dGroups?: Array<{
            sum: {
              responseStatusMap?: Array<{ edgeResponseStatus: number; requests: number }>;
            };
          }>;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `Cloudflare Analytics API error: ${json.errors.map((e) => e.message).join(', ')}`,
    );
  }

  // Aggregate per-path request counts across all time groups
  const pathMap = new Map<string, number>();
  const zones = json.data?.viewer.zones ?? [];
  for (const zone of zones) {
    const groups = zone.httpRequests1hGroups ?? [];
    for (const group of groups) {
      const entries = group.sum.urlPathSummary ?? [];
      for (const entry of entries) {
        pathMap.set(entry.path, (pathMap.get(entry.path) ?? 0) + entry.requests);
      }
    }
  }

  const entries: TrafficEntry[] = [...pathMap.entries()].map(([path, requests]) => ({
    path,
    requests,
  }));

  const pageEntries = filterPagePaths(entries, apiBasePath);
  return selectHotPaths(pageEntries, threshold, maxPages);
}

// ---------------------------------------------------------------------------
// Pre-rendering
// ---------------------------------------------------------------------------

/**
 * Pre-render a list of pages and store in KV.
 *
 * Renders pages with bounded concurrency and reports progress.
 */
export async function preRenderPages(options: PreRenderOptions): Promise<PreRenderResult> {
  const { paths, kvNamespace, renderFn, concurrency = 10, onProgress } = options;

  const start = performance.now();
  let rendered = 0;
  const failed: PreRenderResult['failed'] = [];

  // Process in batches for concurrency control
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (path) => {
        const html = await renderFn(path);
        await storeCache(kvNamespace, path, html);
        return path;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      const path = batch[j]!;
      if (result.status === 'fulfilled') {
        rendered++;
        onProgress?.(rendered, paths.length, path);
      } else {
        const error =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        failed.push({ path, error });
      }
    }
  }

  return {
    rendered,
    failed,
    durationMs: performance.now() - start,
  };
}
