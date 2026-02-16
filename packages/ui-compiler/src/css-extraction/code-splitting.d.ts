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
export declare class CSSCodeSplitter {
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
  ): Record<string, string>;
}
//# sourceMappingURL=code-splitting.d.ts.map
