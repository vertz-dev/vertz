import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
import { findBodyNode, isShadowedInNestedScope } from '../utils';

/**
 * Auto-wrap query() arguments in a thunk when they contain reactive deps.
 *
 * Transforms:
 *   query(api.brands.list({ offset: offset }))
 * Into:
 *   query(() => api.brands.list({ offset: offset }))
 *
 * This ensures that reactive reads (offset.value after signal transform)
 * happen inside the query's lifecycleEffect, enabling automatic re-fetch
 * when dependencies change. (#1861)
 *
 * Only wraps when:
 * - The first argument is NOT already an arrow/function expression
 * - The first argument contains references to reactive variables
 *   (signals, computeds, or reactive sources like useSearchParams/useContext/useAuth)
 */
export class QueryAutoThunkTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
    queryAliases: Set<string>,
  ): void {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    // Collect reactive variable names (signals, computeds, and reactive sources)
    const reactiveVars = new Set(
      variables
        .filter((v) => v.kind === 'signal' || v.kind === 'computed' || v.isReactiveSource)
        .map((v) => v.name),
    );

    if (reactiveVars.size === 0 || queryAliases.size === 0) return;

    bodyNode.forEachDescendant((node) => {
      if (!node.isKind(SyntaxKind.CallExpression)) return;

      const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression);
      const callee = callExpr.getExpression();

      // Check if callee is a query() call
      if (!callee.isKind(SyntaxKind.Identifier)) return;
      if (!queryAliases.has(callee.getText())) return;

      const args = callExpr.getArguments();
      if (args.length === 0) return;

      const firstArg = args[0];
      if (!firstArg) return;

      // Skip if already a function/arrow expression
      if (
        firstArg.isKind(SyntaxKind.ArrowFunction) ||
        firstArg.isKind(SyntaxKind.FunctionExpression)
      ) {
        return;
      }

      // Check if the first argument references any reactive variables
      if (!containsReactiveRef(firstArg, reactiveVars, bodyNode)) return;

      // Wrap: insert `() => ` before the argument
      source.appendLeft(firstArg.getStart(), '() => ');
    });
  }
}

/**
 * Check if a node contains references to any reactive variables.
 * Skips identifiers that are property names, declaration names, or shadowed.
 */
function containsReactiveRef(node: Node, reactiveVars: Set<string>, bodyNode: Node): boolean {
  if (node.isKind(SyntaxKind.Identifier)) {
    const name = node.getText();
    if (!reactiveVars.has(name)) return false;

    const parent = node.getParent();
    if (!parent) return false;

    // Skip property access name (right side of obj.prop)
    if (parent.isKind(SyntaxKind.PropertyAccessExpression) && parent.getNameNode() === node) {
      return false;
    }

    // Skip property name in object literals: { key: value }
    if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getNameNode() === node) {
      return false;
    }

    // Skip if shadowed in a nested scope
    if (isShadowedInNestedScope(node, name, bodyNode)) return false;

    return true;
  }

  for (const child of node.getChildren()) {
    if (containsReactiveRef(child, reactiveVars, bodyNode)) return true;
  }

  return false;
}
