import type MagicString from 'magic-string';
import { type SourceFile } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
/**
 * Transform `let x = val` → `const x = signal(val)` and all reads/writes
 * for variables classified as signals.
 *
 * Accepts optional mutation ranges to skip — identifiers within mutation
 * expressions are handled by the MutationTransformer instead.
 */
export declare class SignalTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
    mutationRanges?: Array<{
      start: number;
      end: number;
    }>,
  ): void;
}
//# sourceMappingURL=signal-transformer.d.ts.map
