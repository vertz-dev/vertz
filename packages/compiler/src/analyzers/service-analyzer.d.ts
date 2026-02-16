import type { Expression, ObjectLiteralExpression } from 'ts-morph';
import type { InjectRef, ServiceIR, ServiceMethodIR } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface ServiceAnalyzerResult {
  services: ServiceIR[];
}
export declare class ServiceAnalyzer extends BaseAnalyzer<ServiceAnalyzerResult> {
  analyze(): Promise<ServiceAnalyzerResult>;
  analyzeForModule(moduleDefVarName: string, moduleName: string): Promise<ServiceIR[]>;
}
export declare function parseInjectRefs(obj: ObjectLiteralExpression): InjectRef[];
export declare function extractMethodSignatures(expr: Expression): ServiceMethodIR[];
//# sourceMappingURL=service-analyzer.d.ts.map
