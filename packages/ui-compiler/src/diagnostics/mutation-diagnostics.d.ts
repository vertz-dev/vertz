import { type SourceFile } from 'ts-morph';
import type { CompilerDiagnostic, ComponentInfo, VariableInfo } from '../types';
/**
 * Detect mutations on `const` variables that are referenced in JSX.
 * These are likely bugs — the user probably meant to use `let`.
 */
export declare class MutationDiagnostics {
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): CompilerDiagnostic[];
}
//# sourceMappingURL=mutation-diagnostics.d.ts.map
