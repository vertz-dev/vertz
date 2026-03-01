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

    // Build maps of signal API variables and reactive source variables
    const signalApiVars = new Map<string, Set<string>>();
    const plainPropVars = new Map<string, Set<string>>();
    const fieldSignalPropVars = new Map<string, Set<string>>();
    const reactiveSourceVars = new Set<string>();
    for (const v of variables) {
      if (v.signalProperties && v.signalProperties.size > 0) {
        signalApiVars.set(v.name, v.signalProperties);
      }
      if (v.plainProperties && v.plainProperties.size > 0) {
        plainPropVars.set(v.name, v.plainProperties);
      }
      if (v.fieldSignalProperties && v.fieldSignalProperties.size > 0) {
        fieldSignalPropVars.set(v.name, v.fieldSignalProperties);
      }
      if (v.isReactiveSource) {
        reactiveSourceVars.add(v.name);
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
      const hasSignalApiAccess = containsSignalApiPropertyAccess(
        expr,
        signalApiVars,
        plainPropVars,
        fieldSignalPropVars,
      );
      const hasReactiveSourceAccess = containsReactiveSourceAccess(expr, reactiveSourceVars);

      results.push({
        start: expr.getStart(),
        end: expr.getEnd(),
        reactive: uniqueDeps.length > 0 || hasSignalApiAccess || hasReactiveSourceAccess,
        deps: uniqueDeps,
      });
    }

    return results;
  }
}

/**
 * Check if a node contains a PropertyAccessExpression that accesses
 * a signal property on a signal API variable.
 *
 * Handles two patterns:
 * - 2-level: `tasks.loading` (root.signalProp)
 * - 3-level: `taskForm.title.error` (root.field.fieldSignalProp)
 */
function containsSignalApiPropertyAccess(
  node: Node,
  signalApiVars: Map<string, Set<string>>,
  plainPropVars: Map<string, Set<string>>,
  fieldSignalPropVars: Map<string, Set<string>>,
): boolean {
  if (signalApiVars.size === 0 && fieldSignalPropVars.size === 0) return false;

  const propAccesses = node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const pa of propAccesses) {
    const obj = pa.getExpression();
    const propName = pa.getName();

    // 2-level: root.signalProp
    if (obj.isKind(SyntaxKind.Identifier)) {
      const varName = obj.getText();
      const signalProps = signalApiVars.get(varName);
      if (signalProps?.has(propName)) {
        return true;
      }
    }

    // 3-level: root.field.fieldSignalProp
    if (obj.isKind(SyntaxKind.PropertyAccessExpression)) {
      const innerExpr = obj.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      const rootExpr = innerExpr.getExpression();
      const middleProp = innerExpr.getName();

      if (rootExpr.isKind(SyntaxKind.Identifier)) {
        const rootName = rootExpr.getText();
        const fieldSignalProps = fieldSignalPropVars.get(rootName);
        if (!fieldSignalProps) continue;

        // Middle must NOT be a signal property or plain property (it's a field name)
        const signalProps = signalApiVars.get(rootName);
        const plainProps = plainPropVars.get(rootName);
        if (signalProps?.has(middleProp) || plainProps?.has(middleProp)) continue;

        // Leaf must be a field signal property
        if (fieldSignalProps.has(propName)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if a node contains a property access or bare reference to a reactive source variable.
 * Any property access on a reactive source (e.g., ctx.theme) is reactive.
 * A bare reactive source identifier (e.g., {ctx}) is also reactive.
 */
function containsReactiveSourceAccess(node: Node, reactiveSourceVars: Set<string>): boolean {
  if (reactiveSourceVars.size === 0) return false;

  // Check for property access: ctx.theme
  const propAccesses = node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const pa of propAccesses) {
    const obj = pa.getExpression();
    if (obj.isKind(SyntaxKind.Identifier) && reactiveSourceVars.has(obj.getText())) {
      return true;
    }
  }

  // Check for bare identifier: {ctx}
  const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const id of identifiers) {
    if (reactiveSourceVars.has(id.getText())) {
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
