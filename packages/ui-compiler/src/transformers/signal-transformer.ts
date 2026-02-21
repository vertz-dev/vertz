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

    // Build map of variables with signal properties (from signal APIs)
    const signalApiVars = new Map<string, Set<string>>();
    for (const v of variables) {
      if (v.signalProperties && v.signalProperties.size > 0) {
        signalApiVars.set(v.name, v.signalProperties);
      }
    }

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    if (signals.size > 0) {
      transformDeclarations(source, bodyNode, signals);
      transformReferences(source, bodyNode, signals, mutationRanges);
    }

    if (signalApiVars.size > 0) {
      transformSignalApiProperties(source, bodyNode, signalApiVars);
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
 * Transform property accesses on signal API variables to auto-unwrap.
 * E.g., tasks.data → tasks.data.value
 */
function transformSignalApiProperties(
  source: MagicString,
  bodyNode: Node,
  signalApiVars: Map<string, Set<string>>,
): void {
  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.PropertyAccessExpression)) return;

    const expr = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const objExpr = expr.getExpression();
    const propName = expr.getName();

    // Check if the object is a signal API variable
    if (!objExpr.isKind(SyntaxKind.Identifier)) return;
    const varName = objExpr.getText();

    const signalProps = signalApiVars.get(varName);
    if (!signalProps || !signalProps.has(propName)) return;

    // Guard: Check if .value is already present (migration case)
    const parent = expr.getParent();
    if (parent?.isKind(SyntaxKind.PropertyAccessExpression)) {
      const parentProp = parent.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      if (parentProp.getExpression() === expr && parentProp.getName() === 'value') {
        return; // Already has .value, skip transformation
      }
    }

    // Use appendLeft so source.slice(start, end) includes the .value transform
    // (appendRight at `end` is NOT captured by slice(start, end), but appendLeft IS)
    source.appendLeft(expr.getEnd(), '.value');
  });
}
