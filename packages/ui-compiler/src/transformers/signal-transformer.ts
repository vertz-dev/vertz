import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Transform `let x = val` → `const x = signal(val)` and all reads/writes
 * for variables classified as signals.
 *
 * Accepts optional mutation ranges to skip — identifiers within mutation
 * expressions are handled by the MutationTransformer instead.
 */
export class SignalTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
    mutationRanges: Array<{ start: number; end: number }> = [],
  ): void {
    const signals = new Set(variables.filter((v) => v.kind === 'signal').map((v) => v.name));
    const signalObjects = new Map<string, Set<string>>(
      variables
        .filter((v) => v.kind === 'signal-object')
        .map((v) => [v.name, v.signalProperties ?? new Set<string>()]),
    );

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    // Transform regular signal declarations and references
    if (signals.size > 0) {
      transformDeclarations(source, bodyNode, signals);
      transformReferences(source, bodyNode, signals, mutationRanges);
    }

    // Transform signal-object property access
    if (signalObjects.size > 0) {
      transformSignalObjectProperties(source, bodyNode, signalObjects);
    }
  }
}

function transformDeclarations(source: MagicString, bodyNode: Node, signals: Set<string>): void {
  for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
    if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
    const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
    if (!declList) continue;

    for (const decl of declList.getDeclarations()) {
      const name = decl.getName();
      if (!signals.has(name)) continue;

      const init = decl.getInitializer();
      if (!init) continue;

      const letKeyword = declList.getFirstChildByKind(SyntaxKind.LetKeyword);
      if (letKeyword) {
        source.overwrite(letKeyword.getStart(), letKeyword.getEnd(), 'const');
      }

      source.appendLeft(init.getStart(), 'signal(');
      source.appendRight(init.getEnd(), ')');
    }
  }
}

function isInsideMutationRange(
  pos: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

function transformReferences(
  source: MagicString,
  bodyNode: Node,
  signals: Set<string>,
  mutationRanges: Array<{ start: number; end: number }>,
): void {
  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.Identifier)) return;
    const name = node.getText();
    if (!signals.has(name)) return;

    const parent = node.getParent();
    if (!parent) return;

    // Skip the declaration itself
    if (parent.isKind(SyntaxKind.VariableDeclaration) && parent.getNameNode() === node) {
      return;
    }

    // Skip property access name (right side): obj.name
    if (parent.isKind(SyntaxKind.PropertyAccessExpression) && parent.getNameNode() === node) {
      return;
    }

    // Skip property name in object literals: { count: val } — don't touch 'count'
    if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getNameNode() === node) {
      return;
    }

    // Skip shorthand property assignment: { count } — don't touch 'count' as a key
    if (parent.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      return;
    }

    // Skip identifiers inside mutation expression ranges (handled by MutationTransformer)
    if (isInsideMutationRange(node.getStart(), mutationRanges)) {
      return;
    }

    // Use overwrite so source.slice() includes the .value transform
    source.overwrite(node.getStart(), node.getEnd(), `${name}.value`);
  });
}

/**
 * Transform property access on signal-objects to auto-unwrap signal properties.
 *
 * Example: tasks.loading → tasks.loading.value (if loading is a signal property)
 * Example: tasks.refetch() → tasks.refetch() (if refetch is not a signal property)
 * Example: form.errors.name → form.errors.value.name (unwrap .errors, then access .name)
 */
function transformSignalObjectProperties(
  source: MagicString,
  bodyNode: Node,
  signalObjects: Map<string, Set<string>>,
): void {
  const transformed = new Set<number>(); // Track positions we've already transformed

  bodyNode.forEachDescendant((node) => {
    // Look for PropertyAccessExpression: obj.prop
    if (!node.isKind(SyntaxKind.PropertyAccessExpression)) return;

    // Skip if we've already transformed this property access
    const propNodeEnd = node.getNameNode().getEnd();
    if (transformed.has(propNodeEnd)) return;

    const expression = node.getExpression();
    const propertyName = node.getName();

    // Case 1: Simple access: tasks.loading
    // Check if expression is an identifier that's a signal-object
    if (expression.isKind(SyntaxKind.Identifier)) {
      const objName = expression.getText();
      const signalProps = signalObjects.get(objName);

      if (signalProps?.has(propertyName)) {
        // This is a signal property access — insert .value after it
        const propertyNode = node.getNameNode();
        source.appendRight(propertyNode.getEnd(), '.value');
        transformed.add(propertyNode.getEnd());
      }
      return;
    }

    // Case 2: Chained access: tasks.data.length or form.errors.name
    // The expression is itself a PropertyAccessExpression
    if (expression.isKind(SyntaxKind.PropertyAccessExpression)) {
      // Walk up the chain to find the root identifier and the first property
      let current = expression;
      while (current.getExpression().isKind(SyntaxKind.PropertyAccessExpression)) {
        current = current.getExpression() as typeof expression;
      }

      // Check if the root is a signal-object
      const rootExpr = current.getExpression();
      if (rootExpr.isKind(SyntaxKind.Identifier)) {
        const objName = rootExpr.getText();
        const signalProps = signalObjects.get(objName);

        if (signalProps) {
          // Check if the first property in the chain is a signal property
          const firstPropName = current.getName();
          const firstPropEnd = current.getNameNode().getEnd();

          if (signalProps.has(firstPropName) && !transformed.has(firstPropEnd)) {
            // Insert .value after the signal property access
            source.appendRight(firstPropEnd, '.value');
            transformed.add(firstPropEnd);
          }
        }
      }
    }
  });
}
