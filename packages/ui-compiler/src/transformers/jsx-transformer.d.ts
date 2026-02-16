import type MagicString from 'magic-string';
import { type SourceFile } from 'ts-morph';
import type { ComponentInfo, JsxExpressionInfo, VariableInfo } from '../types';
/**
 * Transform JSX into DOM helper calls.
 * Reactive expressions are wrapped in functions, static expressions are passed directly.
 *
 * IMPORTANT: This transformer reads expression text from MagicString (via source.slice())
 * so that it picks up .value transforms from the signal/computed transformers.
 */
export declare class JsxTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
    jsxExpressions: JsxExpressionInfo[],
  ): void;
  /**
   * Walk the full function body and transform every top-level JSX node.
   * "Top-level" means JSX that isn't nested inside other JSX (children are
   * handled recursively by transformJsxNode).
   */
  private transformAllJsx;
}
//# sourceMappingURL=jsx-transformer.d.ts.map
