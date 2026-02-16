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
/**
 * Builds a manifest mapping routes to their CSS file dependencies.
 */
export class RouteCSSManifest {
  /**
   * Build a route-to-CSS manifest.
   *
   * @param routeToFiles - Map of route path to the component file paths used by that route.
   * @param fileExtractions - Map of file path to CSS extraction result.
   * @returns Map of route path to list of CSS-contributing file paths.
   */
  build(routeToFiles, fileExtractions) {
    const manifest = new Map();
    for (const [route, files] of routeToFiles) {
      const cssFiles = [];
      for (const filePath of files) {
        const extraction = fileExtractions.get(filePath);
        if (extraction && extraction.css.length > 0) {
          cssFiles.push(filePath);
        }
      }
      manifest.set(route, cssFiles);
    }
    return manifest;
  }
}
//# sourceMappingURL=route-css-manifest.js.map
