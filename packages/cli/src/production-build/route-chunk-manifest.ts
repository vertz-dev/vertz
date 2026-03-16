/**
 * Route Chunk Manifest Generator
 *
 * Parses the bundled entry file to extract route pattern → chunk filename
 * mappings. The route-splitting transformer converts static route imports
 * to dynamic `import("./chunk-HASH.js")` calls. This module reads the
 * built output to discover which chunks serve which routes.
 */

export interface RouteChunkManifest {
  /** Route pattern → array of chunk paths for that route. */
  routes: Record<string, string[]>;
}

/**
 * Extract route → chunk mappings from a bundled entry file's content.
 *
 * Scans for patterns like:
 *   "/path": { component: () => import("./chunk-HASH.js").then(...) }
 *
 * @param entryContent - The full text of the bundled client entry file.
 * @param assetPrefix - URL prefix for chunk paths (e.g., "/assets").
 */
export function generateRouteChunkManifest(
  entryContent: string,
  assetPrefix: string,
): RouteChunkManifest {
  const routes: Record<string, string[]> = {};

  // Match: "routePattern" or 'routePattern' followed by a component with import()
  // The route key starts with / and the import path starts with ./
  // Uses [\s\S]*? instead of [^}]*? to handle nested braces (e.g., children objects).
  const pattern =
    /(?:"|')(\/?[^"']*?)(?:"|')\s*:\s*\{[\s\S]*?component\s*:\s*\(\)\s*=>\s*import\s*\(\s*(?:"|')(\.[^"']+?)(?:"|')\s*\)/g;

  for (const match of entryContent.matchAll(pattern)) {
    const routeKey = match[1] ?? '';
    const chunkFile = match[2] ?? '';

    // Only include route patterns (start with /)
    if (!routeKey.startsWith('/')) continue;

    // Convert relative chunk path to asset URL
    const chunkName = chunkFile.replace(/^\.\//, '');
    const chunkPath = `${assetPrefix}/${chunkName}`;

    routes[routeKey] = [chunkPath];
  }

  return { routes };
}
