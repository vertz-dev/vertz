/**
 * Route-Level CSS Code Splitting — Produces per-route CSS bundles.
 *
 * Uses the route-CSS manifest to split CSS into per-route chunks.
 * Shared CSS (used by multiple routes) goes into a common chunk (`__common`).
 * Each route only loads the CSS it needs, reducing initial payload.
 */

import type { CSSExtractionResult } from './extractor';

/**
 * Splits extracted CSS into per-route chunks with a shared common chunk.
 */
export class CSSCodeSplitter {
  /**
   * Split CSS by route, extracting shared CSS into a common chunk.
   *
   * @param manifest - Map of route path to list of CSS-contributing file paths.
   * @param fileExtractions - Map of file path to CSS extraction result.
   * @returns Record of route path (or `__common`) to CSS string.
   */
  split(
    manifest: Map<string, string[]>,
    fileExtractions: Map<string, CSSExtractionResult>,
  ): Record<string, string> {
    // Count how many routes reference each file
    const fileRouteCount = new Map<string, number>();

    for (const [_route, files] of manifest) {
      for (const filePath of files) {
        fileRouteCount.set(filePath, (fileRouteCount.get(filePath) ?? 0) + 1);
      }
    }

    // Files used by more than one route go into the common chunk
    const sharedFiles = new Set<string>();
    for (const [filePath, count] of fileRouteCount) {
      if (count > 1) {
        sharedFiles.add(filePath);
      }
    }

    const result: Record<string, string> = {};

    // Build common chunk
    const commonCSS: string[] = [];
    for (const filePath of sharedFiles) {
      const extraction = fileExtractions.get(filePath);
      if (extraction && extraction.css.length > 0) {
        commonCSS.push(extraction.css);
      }
    }
    if (commonCSS.length > 0) {
      result.__common = commonCSS.join('\n');
    }

    // Build per-route chunks (excluding shared CSS)
    for (const [route, files] of manifest) {
      const routeCSS: string[] = [];

      for (const filePath of files) {
        if (sharedFiles.has(filePath)) continue;

        const extraction = fileExtractions.get(filePath);
        if (extraction && extraction.css.length > 0) {
          routeCSS.push(extraction.css);
        }
      }

      result[route] = routeCSS.join('\n');
    }

    return result;
  }
}
