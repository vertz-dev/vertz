/** Result of extracting CSS from a source file. */
export interface CSSExtractionResult {
  /** The extracted CSS rules as a string. */
  css: string;
  /** The block names found in static css() calls. */
  blockNames: string[];
}
