import type MagicString from 'magic-string';
import { type SourceFile } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
/**
 * Transform `const x = expr` → `const x = computed(() => expr)` when classified as computed.
 * Also handles destructuring: `const { a, b } = expr` → individual computed declarations.
 */
export declare class ComputedTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): void;
}
//# sourceMappingURL=computed-transformer.d.ts.map
