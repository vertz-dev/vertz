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
    // Destructured props are getter-backed (__props.xxx) — they must be
    // classified as reactive sources so JSX expressions referencing them
    // get effect wrapping for signal tracking.
    if (component.destructuredProps) {
      for (const binding of component.destructuredProps.bindings) {
        if (!binding.isRest) {
          reactiveSourceVars.add(binding.bindingName);
        }
      }
    }
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
      const hasSignalApiRef = containsSignalApiReference(expr, signalApiVars);
      const hasReactiveSourceAccess = containsReactiveSourceAccess(expr, reactiveSourceVars);

      results.push({
        start: expr.getStart(),
        end: expr.getEnd(),
        reactive:
          uniqueDeps.length > 0 || hasSignalApiAccess || hasSignalApiRef || hasReactiveSourceAccess,
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
 * - N-level (>= 3): `taskForm.title.error`, `taskForm.address.street.error`,
 *   `taskForm[field].error` (root + intermediates + fieldSignalProp leaf)
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

    // N-level (>= 3): Walk up the chain to find the root identifier
    // Quick check: leaf must be a potential fieldSignalProperty
    let anyHasLeaf = false;
    for (const props of fieldSignalPropVars.values()) {
      if (props.has(propName)) {
        anyHasLeaf = true;
        break;
      }
    }
    if (!anyHasLeaf) continue;

    let current: Node = obj;
    const intermediateNames: string[] = [];
    let chainLength = 2; // root + leaf

    while (true) {
      if (current.isKind(SyntaxKind.PropertyAccessExpression)) {
        const innerPa = current.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        intermediateNames.unshift(innerPa.getName());
        current = innerPa.getExpression();
        chainLength++;
      } else if (current.isKind(SyntaxKind.ElementAccessExpression)) {
        const ea = current.asKindOrThrow(SyntaxKind.ElementAccessExpression);
        current = ea.getExpression();
        chainLength++;
      } else {
        break;
      }
    }

    if (!current.isKind(SyntaxKind.Identifier)) continue;
    const rootName = current.getText();

    const fieldSignalProps = fieldSignalPropVars.get(rootName);
    if (!fieldSignalProps) continue;
    if (chainLength < 3) continue;
    if (!fieldSignalProps.has(propName)) continue;

    // No intermediate can be a signalProperty or plainProperty
    const signalProps = signalApiVars.get(rootName);
    const plainProps = plainPropVars.get(rootName);
    let intermediateBlocked = false;
    for (const name of intermediateNames) {
      if (signalProps?.has(name) || plainProps?.has(name)) {
        intermediateBlocked = true;
        break;
      }
    }
    if (intermediateBlocked) continue;

    return true;
  }
  return false;
}

/**
 * Check if a signal API variable is passed as an argument to a function call
 * (e.g., `queryMatch(todosQuery, ...)`). When a signal API variable is passed
 * as an argument, the callee will internally read reactive properties,
 * so the expression is reactive.
 *
 * Does NOT match property accesses like `todosQuery.data` or `taskForm.title`
 * — those are handled by containsSignalApiPropertyAccess.
 */
function containsSignalApiReference(node: Node, signalApiVars: Map<string, Set<string>>): boolean {
  if (signalApiVars.size === 0) return false;

  const callExprs = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExprs) {
    for (const arg of call.getArguments()) {
      if (arg.isKind(SyntaxKind.Identifier) && signalApiVars.has(arg.getText())) {
        return true;
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
