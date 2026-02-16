import type { CodegenConfig } from './config';
import { resolveCodegenConfig } from './config';
import type { GenerateResult } from './generate';
import type { CodegenIR } from './types';
export interface CodegenPipeline {
  validate(config: CodegenConfig): string[];
  generate(ir: CodegenIR, config: CodegenConfig): GenerateResult;
  resolveOutputDir(config: CodegenConfig): string;
  resolveConfig(config: CodegenConfig): ReturnType<typeof resolveCodegenConfig>;
}
export declare function createCodegenPipeline(): CodegenPipeline;
//# sourceMappingURL=pipeline.d.ts.map
