import { resolveCodegenConfig, validateCodegenConfig } from './config';
import { generateSync } from './generate';
export function createCodegenPipeline() {
  return {
    validate(config) {
      return validateCodegenConfig(config);
    },
    generate(ir, config) {
      const resolved = resolveCodegenConfig(config);
      return generateSync(ir, resolved);
    },
    resolveOutputDir(config) {
      const resolved = resolveCodegenConfig(config);
      return resolved.outputDir;
    },
    resolveConfig(config) {
      return resolveCodegenConfig(config);
    },
  };
}
//# sourceMappingURL=pipeline.js.map
