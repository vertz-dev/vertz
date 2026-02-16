import type { Expression, ObjectLiteralExpression } from 'ts-morph';
import type { ImportRef, ModuleIR } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface ModuleAnalyzerResult {
  modules: ModuleIR[];
}
export declare class ModuleAnalyzer extends BaseAnalyzer<ModuleAnalyzerResult> {
  analyze(): Promise<ModuleAnalyzerResult>;
}
export declare function parseImports(obj: ObjectLiteralExpression): ImportRef[];
export declare function extractIdentifierNames(expr: Expression): string[];
//# sourceMappingURL=module-analyzer.d.ts.map
