import type { GeneratedFile } from '../config/defaults';
export interface GenerateOptions {
  type: string;
  name: string;
  module?: string;
  sourceDir: string;
  dryRun?: boolean;
}
export type GenerateResult =
  | {
      success: true;
      files: GeneratedFile[];
    }
  | {
      success: false;
      files: GeneratedFile[];
      error: string;
    };
export declare function generateAction(options: GenerateOptions): GenerateResult;
//# sourceMappingURL=generate.d.ts.map
