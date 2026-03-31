/**
 * In-memory prefetch manifest manager for the dev server.
 *
 * Holds the SSR prefetch manifest in memory and rebuilds it incrementally
 * when component files change, or fully when the router file changes.
 * Provides atomic read access for concurrent SSR requests.
 */
import {
  analyzeComponentQueries,
  generatePrefetchManifest,
  type ManifestRoute,
  type PrefetchManifest,
} from './compiler/prefetch-manifest';
import type { SSRPrefetchManifest } from './ssr-single-pass';

export interface PrefetchManifestManagerOptions {
  /** Absolute path to the router file. */
  routerPath: string;
  /** Read a file's contents. Returns undefined if file doesn't exist. */
  readFile: (path: string) => string | undefined;
  /** Resolve an import specifier from a given file to an absolute path. */
  resolveImport: (specifier: string, fromFile: string) => string | undefined;
}

export interface PrefetchManifestSnapshot {
  manifest: PrefetchManifest | null;
  rebuildCount: number;
  lastRebuildMs: number | null;
  lastRebuildAt: string | null;
}

export interface PrefetchManifestManager {
  /** Initial full manifest build. */
  build(): void;
  /** Handle a file change — incremental for components, full for router. */
  onFileChange(filePath: string, sourceText: string): void;
  /** Get the SSR manifest for rendering (atomic read). */
  getSSRManifest(): SSRPrefetchManifest | undefined;
  /** Get diagnostic snapshot for the `/__vertz_prefetch_manifest` endpoint. */
  getSnapshot(): PrefetchManifestSnapshot;
}

export function createPrefetchManifestManager(
  options: PrefetchManifestManagerOptions,
): PrefetchManifestManager {
  const { routerPath, readFile, resolveImport } = options;

  // Atomic references — replaced, never mutated
  let currentManifest: PrefetchManifest | null = null;
  let currentSSRManifest: SSRPrefetchManifest | undefined;

  // Metadata
  let rebuildCount = 0;
  let lastRebuildMs: number | null = null;
  let lastRebuildAt: string | null = null;

  // Map from absolute file path to route indices (for incremental updates)
  let fileToRouteIndices = new Map<string, number[]>();

  function buildFileIndex(routes: ManifestRoute[]): Map<string, number[]> {
    const index = new Map<string, number[]>();
    for (let i = 0; i < routes.length; i++) {
      const file = routes[i]?.file;
      if (file) {
        const existing = index.get(file) ?? [];
        existing.push(i);
        index.set(file, existing);
      }
    }
    return index;
  }

  function toSSRManifest(manifest: PrefetchManifest): SSRPrefetchManifest {
    // NOTE: entityAccess is not populated here. It requires a build step that
    // imports @vertz/server entity definitions and serializes their access rules.
    // This is a planned integration point — the plumbing in filterByEntityAccess
    // and evaluateAccessRule is ready, but the data source (entity defs → serialized
    // rules → manifest) is a separate concern tied to the production build pipeline.

    // Build routeEntries for zero-discovery prefetching.
    // Each route pattern maps to the combined queries from all routes with that pattern.
    const routeEntries: Record<string, { queries: (typeof manifest.routes)[0]['queries'] }> = {};
    for (const route of manifest.routes) {
      const existing = routeEntries[route.pattern];
      if (existing) {
        existing.queries.push(...route.queries);
      } else {
        routeEntries[route.pattern] = { queries: [...route.queries] };
      }
    }

    return {
      routePatterns: [...new Set(manifest.routes.map((r) => r.pattern))],
      routeEntries,
    };
  }

  function fullBuild(routerSourceOverride?: string): void {
    const start = performance.now();
    const routerSource = routerSourceOverride ?? readFile(routerPath);
    if (!routerSource) {
      // Router file not found — graceful degradation
      return;
    }

    try {
      const manifest = generatePrefetchManifest({
        routerSource,
        routerPath,
        readFile,
        resolveImport,
      });

      // Atomic swap
      currentManifest = manifest;
      currentSSRManifest = toSSRManifest(manifest);
      fileToRouteIndices = buildFileIndex(manifest.routes);
      rebuildCount++;
      lastRebuildMs = Math.round(performance.now() - start);
      lastRebuildAt = new Date().toISOString();
    } catch {
      // Build failed — keep previous manifest (or undefined)
    }
  }

  function incrementalUpdate(filePath: string, sourceText: string): void {
    if (!currentManifest) return;

    const indices = fileToRouteIndices.get(filePath);
    if (!indices || indices.length === 0) return;

    const start = performance.now();

    try {
      const analysis = analyzeComponentQueries(sourceText, filePath);

      // Create new routes array with updated queries for this component
      const newRoutes = [...currentManifest.routes];
      for (const idx of indices) {
        const existing = newRoutes[idx];
        if (existing) {
          newRoutes[idx] = {
            ...existing,
            queries: analysis.queries,
            params: analysis.params,
          };
        }
      }

      // Atomic swap
      const newManifest: PrefetchManifest = {
        ...currentManifest,
        routes: newRoutes,
        generatedAt: new Date().toISOString(),
      };
      currentManifest = newManifest;
      currentSSRManifest = toSSRManifest(newManifest);
      rebuildCount++;
      lastRebuildMs = Math.round(performance.now() - start);
      lastRebuildAt = new Date().toISOString();
    } catch {
      // Incremental update failed — keep previous manifest
    }
  }

  return {
    build() {
      fullBuild();
    },

    onFileChange(filePath: string, sourceText: string) {
      if (filePath === routerPath) {
        // Router changed — full rebuild with provided source
        fullBuild(sourceText);
      } else {
        // Component file changed — incremental update
        incrementalUpdate(filePath, sourceText);
      }
    },

    getSSRManifest() {
      return currentSSRManifest;
    },

    getSnapshot(): PrefetchManifestSnapshot {
      return {
        manifest: currentManifest,
        rebuildCount,
        lastRebuildMs,
        lastRebuildAt,
      };
    },
  };
}
