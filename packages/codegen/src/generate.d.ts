import type { AppIR } from '@vertz/compiler';
import type { ResolvedCodegenConfig } from './config';
import type { IncrementalResult } from './incremental';
import type { CodegenIR, GeneratedFile } from './types';
export interface GenerateResult {
  /** The files that were generated (paths relative to outputDir). */
  files: GeneratedFile[];
  /** The CodegenIR that was derived from the AppIR. */
  ir: CodegenIR;
  /** Number of files generated. */
  fileCount: number;
  /** Which generators were run. */
  generators: string[];
  /** Incremental write stats (only present when incremental mode is used). */
  incremental?: IncrementalResult;
}
export declare function generateSync(ir: CodegenIR, config: ResolvedCodegenConfig): GenerateResult;
/**
 * Top-level orchestrator that ties together the full codegen pipeline:
 * 1. Converts AppIR to CodegenIR via the IR adapter
 * 2. Runs configured generators to produce GeneratedFile[]
 * 3. Optionally formats output with Biome
 * 4. Writes files to disk (incrementally when enabled)
 */
export declare function generate(
  appIR: AppIR,
  config: ResolvedCodegenConfig,
): Promise<GenerateResult>;
//# sourceMappingURL=generate.d.ts.map
