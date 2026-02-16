/**
 * Dead CSS Elimination — Removes styles from tree-shaken/unused components.
 *
 * Takes a set of used component/style identifiers (from the module graph)
 * and filters the extracted CSS to only include styles that are actually
 * imported/used. Unused css() blocks produce no output.
 *
 * Works at the module/export level: if a module's exports are not imported
 * anywhere in the dependency graph, its CSS is eliminated.
 */
import type { CSSExtractionResult } from './extractor';
/**
 * Eliminates CSS from modules that are not in the used set.
 */
export declare class DeadCSSEliminator {
  /**
   * Filter extracted CSS to only include styles from used modules.
   *
   * @param extractions - Map of file path to extraction result.
   * @param usedFiles - Set of file paths that are reachable in the module graph.
   * @returns Combined CSS from only the used modules.
   */
  eliminate(extractions: Map<string, CSSExtractionResult>, usedFiles: Set<string>): string;
}
//# sourceMappingURL=dead-css.d.ts.map
