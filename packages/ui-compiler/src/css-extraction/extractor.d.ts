/**
 * CSS File Extractor -- Extracts CSS from `css()` calls into separate `.css` files.
 *
 * Walks the AST to find css() calls, resolves the array shorthands statically
 * (using the shared token tables from @vertz/ui/internals), generates
 * CSS rule text for each block, and outputs extracted CSS as a string.
 *
 * This is the core of zero-runtime CSS extraction: all css() calls resolve
 * at build time, so no CSS-in-JS runtime ships in the browser.
 */
/** Result of extracting CSS from a source file. */
export interface CSSExtractionResult {
  /** The extracted CSS rules as a string. */
  css: string;
  /** The block names found in static css() calls. */
  blockNames: string[];
}
/**
 * Extracts CSS from css() calls in source code.
 * Produces a CSS string and list of block names for each file.
 */
export declare class CSSExtractor {
  /**
   * Extract CSS from all static css() calls in the given source.
   * @param source - The source code to analyze.
   * @param filePath - The file path (used for deterministic class name generation).
   * @returns The extracted CSS and block names.
   */
  extract(source: string, filePath: string): CSSExtractionResult;
}
//# sourceMappingURL=extractor.d.ts.map
