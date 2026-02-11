import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, JsxExpressionInfo, VariableInfo } from '../types';

/**
 * Transform component props: reactive → getter, static → plain value.
 *
 * This transformer's core logic is integrated into the JsxTransformer's
 * buildPropsObject function. This class exists as a standalone API for
 * cases where prop transformation is needed independently.
 */
export class PropTransformer {
  transform(
    _source: MagicString,
    _sourceFile: SourceFile,
    _component: ComponentInfo,
    _variables: VariableInfo[],
    _jsxExpressions: JsxExpressionInfo[],
  ): void {
    // Props transformation is handled inline by JsxTransformer.buildPropsObject.
    // This class is a no-op when the JSX transformer is used.
  }

  /** Build a props object string for a component call. */
  buildPropsObject(attrs: Node[], jsxMap: Map<number, JsxExpressionInfo>): string {
    if (attrs.length === 0) return '{}';

    const props: string[] = [];
    for (const attr of attrs) {
      if (!attr.isKind(SyntaxKind.JsxAttribute)) continue;
      const name = attr.getNameNode().getText();
      const init = attr.getInitializer();

      if (!init) {
        props.push(`${name}: true`);
        continue;
      }

      if (init.isKind(SyntaxKind.StringLiteral)) {
        props.push(`${name}: ${init.getText()}`);
        continue;
      }

      if (init.isKind(SyntaxKind.JsxExpression)) {
        const exprInfo = jsxMap.get(init.getStart());
        const exprNode = init.getExpression();
        const exprText = exprNode?.getText() ?? '';

        if (exprInfo?.reactive) {
          props.push(`get ${name}() { return ${exprText}; }`);
        } else {
          props.push(`${name}: ${exprText}`);
        }
      }
    }

    return `{ ${props.join(', ')} }`;
  }
}
