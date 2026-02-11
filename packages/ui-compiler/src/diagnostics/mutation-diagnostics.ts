import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { CompilerDiagnostic, ComponentInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/** Set of known array/object mutation methods. */
const MUTATION_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

/**
 * Detect mutations on `const` variables that are referenced in JSX.
 * These are likely bugs — the user probably meant to use `let`.
 */
export class MutationDiagnostics {
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): CompilerDiagnostic[] {
    // Find const variables that are classified as static
    const staticConsts = new Set(variables.filter((v) => v.kind === 'static').map((v) => v.name));

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    // Collect JSX-referenced identifiers
    const jsxRefs = collectJsxReferencedIdentifiers(bodyNode);

    // Only flag consts that are both mutated and JSX-referenced
    const constsInJsx = new Set([...staticConsts].filter((name) => jsxRefs.has(name)));

    const diagnostics: CompilerDiagnostic[] = [];

    bodyNode.forEachDescendant((node) => {
      // Method calls: items.push()
      if (node.isKind(SyntaxKind.CallExpression)) {
        const expr = node.getExpression();
        if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
          const objName = getRootIdentifier(expr.getExpression());
          const methodName = expr.getName();
          if (objName && constsInJsx.has(objName) && MUTATION_METHODS.has(methodName)) {
            const pos = sourceFile.getLineAndColumnAtPos(node.getStart());
            diagnostics.push({
              code: 'non-reactive-mutation',
              message: `Mutation \`.${methodName}()\` on \`const ${objName}\` will not trigger UI updates. Change \`const\` to \`let\` to make it reactive.`,
              severity: 'warning',
              line: pos.line,
              column: pos.column - 1,
              fix: `Change \`const ${objName}\` to \`let ${objName}\``,
            });
          }
        }
      }

      // Property assignment: items.foo = bar
      if (node.isKind(SyntaxKind.BinaryExpression)) {
        const left = node.getLeft();
        const op = node.getOperatorToken();
        if (op.isKind(SyntaxKind.EqualsToken) && left.isKind(SyntaxKind.PropertyAccessExpression)) {
          const rootName = getRootIdentifier(left.getExpression());
          if (rootName && constsInJsx.has(rootName)) {
            const pos = sourceFile.getLineAndColumnAtPos(node.getStart());
            diagnostics.push({
              code: 'non-reactive-mutation',
              message: `Property assignment on \`const ${rootName}\` will not trigger UI updates. Change \`const\` to \`let\` to make it reactive.`,
              severity: 'warning',
              line: pos.line,
              column: pos.column - 1,
              fix: `Change \`const ${rootName}\` to \`let ${rootName}\``,
            });
          }
        }
      }
    });

    return diagnostics;
  }
}

function getRootIdentifier(node: Node): string | null {
  if (node.isKind(SyntaxKind.Identifier)) return node.getText();
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    return getRootIdentifier(node.getExpression());
  }
  return null;
}

function collectJsxReferencedIdentifiers(bodyNode: Node): Set<string> {
  const refs = new Set<string>();
  const jsxExprs = bodyNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
  for (const expr of jsxExprs) {
    addIdentifiers(expr, refs);
  }
  return refs;
}

function addIdentifiers(node: Node, refs: Set<string>): void {
  if (node.isKind(SyntaxKind.Identifier)) refs.add(node.getText());
  for (const child of node.getChildren()) {
    addIdentifiers(child, refs);
  }
}
