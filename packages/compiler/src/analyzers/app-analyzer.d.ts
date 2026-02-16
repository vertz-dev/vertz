import type { AppDefinition } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface AppAnalyzerResult {
  app: AppDefinition;
}
export declare class AppAnalyzer extends BaseAnalyzer<AppAnalyzerResult> {
  analyze(): Promise<AppAnalyzerResult>;
  private collectChainedCalls;
  private extractMiddlewares;
  private extractRegistrations;
  private extractOptions;
}
//# sourceMappingURL=app-analyzer.d.ts.map
