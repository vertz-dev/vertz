import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, JsxExpressionInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Map each JSX expression/attribute to its dependencies.
 * Classify as reactive or static based on whether any dependency is a signal,
 * computed, or a signal API property access (e.g., query().data, form().submitting).
 */
export class JsxAnalyzer {
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): JsxExpressionInfo[] {
    const reactiveNames = new Set(
      variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
    );

    // Build map of signal API variables → their signal properties
    const signalApiVars = new Map<string, Set<string>>();
    for (const v of variables) {
      if (v.signalProperties && v.signalProperties.size > 0) {
        signalApiVars.set(v.name, v.signalProperties);
      }
    }

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    const results: JsxExpressionInfo[] = [];

    // Find all JSX expressions
    const jsxExprs = bodyNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
    for (const expr of jsxExprs) {
      const identifiers = collectIdentifiers(expr);
      const deps = identifiers.filter((id) => reactiveNames.has(id));
      const uniqueDeps = [...new Set(deps)];
      const hasSignalApiAccess = containsSignalApiPropertyAccess(expr, signalApiVars);

      results.push({
        start: expr.getStart(),
        end: expr.getEnd(),
        reactive: uniqueDeps.length > 0 || hasSignalApiAccess,
        deps: uniqueDeps,
      });
    }

    return results;
  }
}

/**
 * Check if a node contains a PropertyAccessExpression that accesses
 * a signal property on a signal API variable (e.g., tasks.loading, taskForm.submitting).
 */
function containsSignalApiPropertyAccess(
  node: Node,
  signalApiVars: Map<string, Set<string>>,
): boolean {
  if (signalApiVars.size === 0) return false;

  const propAccesses = node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const pa of propAccesses) {
    const obj = pa.getExpression();
    if (!obj.isKind(SyntaxKind.Identifier)) continue;
    const varName = obj.getText();
    const signalProps = signalApiVars.get(varName);
    if (signalProps?.has(pa.getName())) {
      return true;
    }
  }
  return false;
}

function collectIdentifiers(node: Node): string[] {
  const ids: string[] = [];
  const walk = (n: Node): void => {
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
