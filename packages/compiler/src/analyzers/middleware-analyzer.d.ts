import type { MiddlewareIR } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface MiddlewareAnalyzerResult {
  middleware: MiddlewareIR[];
}
export declare class MiddlewareAnalyzer extends BaseAnalyzer<MiddlewareAnalyzerResult> {
  analyze(): Promise<MiddlewareAnalyzerResult>;
  private resolveSchemaRef;
}
//# sourceMappingURL=middleware-analyzer.d.ts.map
