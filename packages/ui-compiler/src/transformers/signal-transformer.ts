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
    if (signals.size === 0) return;

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    transformDeclarations(source, bodyNode, signals);
    transformReferences(source, bodyNode, signals, mutationRanges);
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

    // Skip identifiers inside mutation expression ranges (handled by MutationTransformer)
    if (isInsideMutationRange(node.getStart(), mutationRanges)) {
      return;
    }

    // Use overwrite so source.slice() includes the .value transform
    source.overwrite(node.getStart(), node.getEnd(), `${name}.value`);
  });
}
