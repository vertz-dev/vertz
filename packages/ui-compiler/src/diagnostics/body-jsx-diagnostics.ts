import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { CompilerDiagnostic, ComponentInfo } from '../types';
import { findBodyNode, isInNestedFunction } from '../utils';

/**
 * Detect JSX expressions outside the return tree in component functions.
 *
 * Body-level JSX compiles to `__element()`, which during hydration claims SSR
 * nodes from the global cursor — breaking the entire hydration tree. JSX must
 * only appear in the return expression or inside deferred callbacks (arrow
 * functions, function expressions, etc.).
 */
export class BodyJsxDiagnostics {
  analyze(sourceFile: SourceFile, component: ComponentInfo): CompilerDiagnostic[] {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    const diagnostics: CompilerDiagnostic[] = [];

    bodyNode.forEachDescendant((node) => {
      if (
        !node.isKind(SyntaxKind.JsxElement) &&
        !node.isKind(SyntaxKind.JsxSelfClosingElement) &&
        !node.isKind(SyntaxKind.JsxFragment)
      ) {
        return;
      }

      // Skip if this JSX is nested inside another JSX node we already flagged
      // (e.g., children of a body-level <div><span/></div> — only flag the outermost)
      if (hasJsxAncestor(node, bodyNode)) return;

      // Allowed: JSX inside a return statement
      if (isInReturnStatement(node, bodyNode)) return;

      // Allowed: JSX inside a nested function (deferred execution)
      if (isInNestedFunction(node, bodyNode)) return;

      const pos = sourceFile.getLineAndColumnAtPos(node.getStart());
      diagnostics.push({
        code: 'jsx-outside-tree',
        severity: 'warning',
        message:
          'JSX outside the return tree creates DOM elements eagerly during hydration, ' +
          'stealing SSR nodes from the render tree. Move this JSX into the return expression, ' +
          'or use document.createElement() for imperative containers.',
        line: pos.line,
        column: pos.column - 1,
        fix: "For imperative containers, use document.createElement('div') (returns typed HTMLDivElement, no cast needed). For rendered content, move the JSX into the return expression.",
      });
    });

    return diagnostics;
  }
}

/** Check if the node is inside a return statement between it and the body. */
function isInReturnStatement(node: Node, bodyNode: Node): boolean {
  let current = node.getParent();
  while (current && current !== bodyNode) {
    if (current.isKind(SyntaxKind.ReturnStatement)) return true;
    current = current.getParent();
  }
  return false;
}

/** Check if the node has a JSX ancestor between it and the body (to avoid double-flagging). */
function hasJsxAncestor(node: Node, bodyNode: Node): boolean {
  let current = node.getParent();
  while (current && current !== bodyNode) {
    if (
      current.isKind(SyntaxKind.JsxElement) ||
      current.isKind(SyntaxKind.JsxSelfClosingElement) ||
      current.isKind(SyntaxKind.JsxFragment)
    ) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}
