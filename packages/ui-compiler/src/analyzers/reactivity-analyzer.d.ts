import { type SourceFile } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
/**
 * Two-pass taint analysis classifying variables as signal, computed, or static.
 *
 * Pass 1: Collect all `let` and `const` declarations in the component body,
 *         along with their dependency references.
 * Pass 2: Starting from JSX-referenced identifiers, trace backwards through
 *         const dependency chains to find which `let` vars are "needed" by JSX.
 *         Those `let` vars become signals, and the intermediate consts become computeds.
 */
export declare class ReactivityAnalyzer {
  analyze(sourceFile: SourceFile, component: ComponentInfo): VariableInfo[];
}
//# sourceMappingURL=reactivity-analyzer.d.ts.map
