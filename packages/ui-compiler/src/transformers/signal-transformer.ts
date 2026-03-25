import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
import { findBodyNode, isShadowedInNestedScope } from '../utils';

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
  const seenNames = new Map<string, number>();

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

      // Build unique HMR key: first occurrence uses bare name, subsequent get $N suffix
      const count = seenNames.get(name) ?? 0;
      seenNames.set(name, count + 1);
      const hmrKey = count === 0 ? name : `${name}$${count}`;

      source.appendLeft(init.getStart(), 'signal(');
      source.appendRight(init.getEnd(), `, '${hmrKey}')`);
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

    // Shorthand property: { count } → { count: count.value }
    // Expand to a regular property assignment so the signal is unwrapped (#1858).
    // Guard: skip if shadowed by a nested scope or inside a mutation range.
    if (parent.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      if (isShadowedInNestedScope(node, name, bodyNode)) return;
      if (isInsideMutationRange(node.getStart(), mutationRanges)) return;
      source.overwrite(node.getStart(), node.getEnd(), `${name}: ${name}.value`);
      return;
    }

    // Skip binding elements in destructuring: let { name } = expr
    if (parent.isKind(SyntaxKind.BindingElement)) {
      return;
    }

    // Skip identifiers inside mutation expression ranges (handled by MutationTransformer)
    if (isInsideMutationRange(node.getStart(), mutationRanges)) {
      return;
    }

    // Skip identifiers shadowed by a nested scope (callback parameter or local variable)
    if (isShadowedInNestedScope(node, name, bodyNode)) {
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
 * - N-level field chains (>= 3 segments): `taskForm.title.error` → `.value`,
 *   `taskForm.address.street.error` → `.value` (root + intermediates + fieldSignalProp leaf)
 * - 2-level: `tasks.data` → `tasks.data.value` (root.signalProp)
 *
 * N-level chains are processed first (Pass 1) to avoid inner PropertyAccessExpressions
 * being matched as 2-level chains in Pass 2.
 */
function transformSignalApiProperties(
  source: MagicString,
  bodyNode: Node,
  signalApiVars: Map<string, Set<string>>,
  plainPropVars: Map<string, Set<string>>,
  fieldSignalPropVars: Map<string, Set<string>>,
): void {
  // Pass 1: Find and transform N-level field signal chains (chain length >= 3), track their ranges
  const fieldChainRanges: Array<{ start: number; end: number }> = [];

  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.PropertyAccessExpression)) return;

    const outerExpr = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const leafProp = outerExpr.getName();

    // Quick check: leaf must be a potential fieldSignalProperty for some variable
    let anyHasLeaf = false;
    for (const props of fieldSignalPropVars.values()) {
      if (props.has(leafProp)) {
        anyHasLeaf = true;
        break;
      }
    }
    if (!anyHasLeaf) return;

    // Walk up the chain to find the root identifier, collecting intermediates
    let current: Node = outerExpr.getExpression();
    const intermediateNames: string[] = [];
    let chainLength = 2; // root + leaf

    while (true) {
      if (current.isKind(SyntaxKind.PropertyAccessExpression)) {
        const pa = current.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        intermediateNames.unshift(pa.getName());
        current = pa.getExpression();
        chainLength++;
      } else if (current.isKind(SyntaxKind.ElementAccessExpression)) {
        // ElementAccessExpression — opaque intermediate (bracket notation)
        const ea = current.asKindOrThrow(SyntaxKind.ElementAccessExpression);
        current = ea.getExpression();
        chainLength++;
        // No named property to validate — skip intermediate name check
      } else {
        break;
      }
    }

    // Root must be an identifier
    if (!current.isKind(SyntaxKind.Identifier)) return;
    const rootName = current.getText();

    // Skip if root identifier is shadowed by a nested scope
    if (isShadowedInNestedScope(current, rootName, bodyNode)) return;

    // Root must have fieldSignalProperties
    const fieldSignalProps = fieldSignalPropVars.get(rootName);
    if (!fieldSignalProps) return;

    // Chain must have >= 3 segments (root + at least one intermediate + leaf)
    if (chainLength < 3) return;

    // Leaf must be a field signal property
    if (!fieldSignalProps.has(leafProp)) return;

    // No intermediate PropertyAccess name can be a signalProperty or plainProperty
    const signalProps = signalApiVars.get(rootName);
    const plainProps = plainPropVars.get(rootName);
    for (const name of intermediateNames) {
      if (signalProps?.has(name) || plainProps?.has(name)) return;
    }

    // Guard: Check if .value is already present (migration case)
    const parent = outerExpr.getParent();
    if (parent?.isKind(SyntaxKind.PropertyAccessExpression)) {
      const parentProp = parent.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      if (parentProp.getExpression() === outerExpr && parentProp.getName() === 'value') {
        fieldChainRanges.push({
          start: outerExpr.getStart(),
          end: outerExpr.getEnd(),
        });
        return;
      }
    }

    // Guard: If the leaf is 'value' and the sub-chain (without leaf) already ends
    // with a fieldSignalProperty, the user manually wrote .value — don't double-append.
    if (leafProp === 'value') {
      const subExpr = outerExpr.getExpression();
      if (subExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const subLeaf = subExpr.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName();
        if (fieldSignalProps.has(subLeaf)) {
          fieldChainRanges.push({
            start: outerExpr.getStart(),
            end: outerExpr.getEnd(),
          });
          return;
        }
      }
    }

    source.appendLeft(outerExpr.getEnd(), '.value');
    fieldChainRanges.push({
      start: outerExpr.getStart(),
      end: outerExpr.getEnd(),
    });
  });

  // Pass 2: Transform 2-level chains, skipping nodes inside N-level chain ranges
  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.PropertyAccessExpression)) return;

    const expr = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);

    // Skip if this node is inside a field chain range
    const nodeStart = expr.getStart();
    if (fieldChainRanges.some((r) => nodeStart >= r.start && nodeStart < r.end)) return;

    const objExpr = expr.getExpression();
    const propName = expr.getName();

    // Check if the object is a signal API variable
    if (!objExpr.isKind(SyntaxKind.Identifier)) return;
    const varName = objExpr.getText();

    // Skip if the variable is shadowed by a nested scope
    if (isShadowedInNestedScope(objExpr, varName, bodyNode)) return;

    const signalProps = signalApiVars.get(varName);
    if (!signalProps || !signalProps.has(propName)) return;

    // Guard: Check if .value is already present (migration case)
    const parent = expr.getParent();
    if (parent?.isKind(SyntaxKind.PropertyAccessExpression)) {
      const parentProp = parent.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      if (parentProp.getExpression() === expr && parentProp.getName() === 'value') {
        return;
      }
    }

    source.appendLeft(expr.getEnd(), '.value');
  });
}
