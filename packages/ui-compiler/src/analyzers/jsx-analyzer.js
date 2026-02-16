import { SyntaxKind } from 'ts-morph';
import { findBodyNode } from '../utils';
/**
 * Map each JSX expression/attribute to its dependencies.
 * Classify as reactive or static based on whether any dependency is a signal or computed.
 */
export class JsxAnalyzer {
  analyze(sourceFile, component, variables) {
    const reactiveNames = new Set(
      variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
    );
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];
    const results = [];
    // Find all JSX expressions
    const jsxExprs = bodyNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
    for (const expr of jsxExprs) {
      const identifiers = collectIdentifiers(expr);
      const deps = identifiers.filter((id) => reactiveNames.has(id));
      const uniqueDeps = [...new Set(deps)];
      results.push({
        start: expr.getStart(),
        end: expr.getEnd(),
        reactive: uniqueDeps.length > 0,
        deps: uniqueDeps,
      });
    }
    return results;
  }
}
function collectIdentifiers(node) {
  const ids = [];
  const walk = (n) => {
    if (n.isKind(SyntaxKind.Identifier)) {
      ids.push(n.getText());
    }
    for (const c of n.getChildren()) {
      walk(c);
    }
  };
  walk(node);
  return ids;
}
//# sourceMappingURL=jsx-analyzer.js.map
