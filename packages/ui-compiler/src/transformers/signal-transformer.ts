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

    // Build maps of variables with signal API properties
    const signalApiVars = new Map<string, Set<string>>();
    const plainPropVars = new Map<string, Set<string>>();
    const fieldSignalPropVars = new Map<string, Set<string>>();
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
    }

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    if (signals.size > 0) {
      transformDeclarations(source, bodyNode, signals);
      transformReferences(source, bodyNode, signals, mutationRanges);
    }

    if (signalApiVars.size > 0 || fieldSignalPropVars.size > 0) {
      transformSignalApiProperties(
        source,
        bodyNode,
        signalApiVars,
        plainPropVars,
        fieldSignalPropVars,
      );
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
 *
 * Handles two patterns:
 * - 2-level: `tasks.data` → `tasks.data.value` (root.signalProp)
 * - 3-level: `taskForm.title.error` → `taskForm.title.error.value` (root.field.fieldSignalProp)
 *
 * 3-level chains are processed first to avoid the inner PropertyAccessExpression
 * being matched as a 2-level check.
 */
function transformSignalApiProperties(
  source: MagicString,
  bodyNode: Node,
  signalApiVars: Map<string, Set<string>>,
  plainPropVars: Map<string, Set<string>>,
  fieldSignalPropVars: Map<string, Set<string>>,
): void {
  // Pass 1: Find and transform 3-level chains, track their ranges
  const threeLevelRanges: Array<{ start: number; end: number }> = [];

  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.PropertyAccessExpression)) return;

    const outerExpr = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const middleExpr = outerExpr.getExpression();
    const leafProp = outerExpr.getName();

    // 3-level: outerExpr = middleExpr.leafProp, middleExpr = rootIdent.middleProp
    if (!middleExpr.isKind(SyntaxKind.PropertyAccessExpression)) return;

    const innerExpr = middleExpr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const rootExpr = innerExpr.getExpression();
    const middleProp = innerExpr.getName();

    if (!rootExpr.isKind(SyntaxKind.Identifier)) return;
    const rootName = rootExpr.getText();

    // Root must be a signal API var with fieldSignalProperties
    const fieldSignalProps = fieldSignalPropVars.get(rootName);
    if (!fieldSignalProps) return;

    // Middle must NOT be a signal property or plain property (it's a field name)
    const signalProps = signalApiVars.get(rootName);
    const plainProps = plainPropVars.get(rootName);
    if (signalProps?.has(middleProp) || plainProps?.has(middleProp)) return;

    // Leaf must be a field signal property
    if (!fieldSignalProps.has(leafProp)) return;

    // Guard: Check if .value is already present (migration case)
    const parent = outerExpr.getParent();
    if (parent?.isKind(SyntaxKind.PropertyAccessExpression)) {
      const parentProp = parent.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      if (parentProp.getExpression() === outerExpr && parentProp.getName() === 'value') {
        threeLevelRanges.push({ start: outerExpr.getStart(), end: outerExpr.getEnd() });
        return; // Already has .value, skip transformation
      }
    }

    source.appendLeft(outerExpr.getEnd(), '.value');
    threeLevelRanges.push({ start: outerExpr.getStart(), end: outerExpr.getEnd() });
  });

  // Pass 2: Transform 2-level chains, skipping nodes inside 3-level ranges
  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.PropertyAccessExpression)) return;

    const expr = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);

    // Skip if this node is inside a 3-level chain range
    const nodeStart = expr.getStart();
    if (threeLevelRanges.some((r) => nodeStart >= r.start && nodeStart < r.end)) return;

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

    source.appendLeft(expr.getEnd(), '.value');
  });
}
