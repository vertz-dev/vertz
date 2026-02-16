import type { GeneratedFile } from './types';
export interface IncrementalResult {
  /** Files that were written (new or changed). */
  written: string[];
  /** Files that were skipped (content unchanged). */
  skipped: string[];
  /** Files that were removed (stale, only in clean mode). */
  removed: string[];
}
export interface IncrementalOptions {
  /** If true, remove files in outputDir that are not in the generated set. */
  clean?: boolean;
}
/**
 * Write generated files to disk incrementally:
 * - Only writes files whose content has changed (or are new).
 * - Optionally removes stale files that are no longer generated.
 */
export declare function writeIncremental(
  files: GeneratedFile[],
  outputDir: string,
  options?: IncrementalOptions,
): Promise<IncrementalResult>;
//# sourceMappingURL=incremental.d.ts.map
