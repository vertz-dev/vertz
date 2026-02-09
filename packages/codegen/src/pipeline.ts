import type { CodegenConfig } from './config';
import { resolveCodegenConfig, validateCodegenConfig } from './config';
import type { GenerateResult } from './generate';
import { generateSync } from './generate';
import type { CodegenIR } from './types';

export interface CodegenPipeline {
  validate(config: CodegenConfig): string[];
  generate(ir: CodegenIR, config: CodegenConfig): GenerateResult;
  resolveOutputDir(config: CodegenConfig): string;
}

export function createCodegenPipeline(): CodegenPipeline {
  return {
    validate(config: CodegenConfig): string[] {
      return validateCodegenConfig(config);
    },

    generate(ir: CodegenIR, config: CodegenConfig): GenerateResult {
      const resolved = resolveCodegenConfig(config);
      return generateSync(ir, resolved);
    },

    resolveOutputDir(config: CodegenConfig): string {
      const resolved = resolveCodegenConfig(config);
      return resolved.outputDir;
    },
  };
}
