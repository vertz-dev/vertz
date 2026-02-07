import { join } from 'node:path';
import type { ResolvedConfig } from '../config';
import type { AppIR } from '../ir/types';

export interface Generator {
  generate(ir: AppIR, outputDir: string): Promise<void>;
}

export abstract class BaseGenerator implements Generator {
  protected readonly config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  abstract generate(ir: AppIR, outputDir: string): Promise<void>;

  protected resolveOutputPath(outputDir: string, fileName: string): string {
    return join(outputDir, fileName);
  }
}
