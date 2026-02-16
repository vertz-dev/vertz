import type MagicString from 'magic-string';
import { type Node, type SourceFile } from 'ts-morph';
import type { ComponentInfo, JsxExpressionInfo, VariableInfo } from '../types';
/**
 * Transform component props: reactive → getter, static → plain value.
 *
 * This transformer's core logic is integrated into the JsxTransformer's
 * buildPropsObject function. This class exists as a standalone API for
 * cases where prop transformation is needed independently.
 */
export declare class PropTransformer {
  transform(
    _source: MagicString,
    _sourceFile: SourceFile,
    _component: ComponentInfo,
    _variables: VariableInfo[],
    _jsxExpressions: JsxExpressionInfo[],
  ): void;
  /** Build a props object string for a component call. */
  buildPropsObject(attrs: Node[], jsxMap: Map<number, JsxExpressionInfo>): string;
}
//# sourceMappingURL=prop-transformer.d.ts.map
