import { type SourceFile } from 'ts-morph';
import type { ComponentInfo, MutationInfo, VariableInfo } from '../types';
/**
 * Detect in-place mutations on signal variables.
 * These need special treatment: peek() + notify() pattern.
 */
export declare class MutationAnalyzer {
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): MutationInfo[];
}
//# sourceMappingURL=mutation-analyzer.d.ts.map
