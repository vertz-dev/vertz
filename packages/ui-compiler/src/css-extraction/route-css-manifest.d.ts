/**
 * Route-to-CSS Mapping Manifest — Maps routes to their CSS dependencies.
 *
 * Analyzes which components are used by which routes and produces a manifest
 * mapping route paths to CSS chunk identifiers. This enables per-route CSS
 * loading so each route only fetches the styles it needs.
 *
 * Example output:
 * {
 *   '/': ['Home.tsx'],
 *   '/about': ['About.tsx'],
 * }
 */
import type { CSSExtractionResult } from './extractor';
/**
 * Builds a manifest mapping routes to their CSS file dependencies.
 */
export declare class RouteCSSManifest {
  /**
   * Build a route-to-CSS manifest.
   *
   * @param routeToFiles - Map of route path to the component file paths used by that route.
   * @param fileExtractions - Map of file path to CSS extraction result.
   * @returns Map of route path to list of CSS-contributing file paths.
   */
  build(
    routeToFiles: Map<string, string[]>,
    fileExtractions: Map<string, CSSExtractionResult>,
  ): Map<string, string[]>;
}
//# sourceMappingURL=route-css-manifest.d.ts.map
