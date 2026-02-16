import type { EnvIR } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface EnvAnalyzerResult {
  env: EnvIR | undefined;
}
export declare class EnvAnalyzer extends BaseAnalyzer<EnvAnalyzerResult> {
  analyze(): Promise<EnvAnalyzerResult>;
}
//# sourceMappingURL=env-analyzer.d.ts.map
