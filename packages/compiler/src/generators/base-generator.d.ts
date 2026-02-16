import type { ResolvedConfig } from '../config';
import type { AppIR } from '../ir/types';
export interface Generator {
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
export declare abstract class BaseGenerator implements Generator {
  protected readonly config: ResolvedConfig;
  constructor(config: ResolvedConfig);
  abstract generate(ir: AppIR, outputDir: string): Promise<void>;
  protected resolveOutputPath(outputDir: string, fileName: string): string;
}
//# sourceMappingURL=base-generator.d.ts.map
