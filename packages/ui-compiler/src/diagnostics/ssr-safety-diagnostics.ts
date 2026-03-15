import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { CompilerDiagnostic, ComponentInfo } from '../types';
import { findBodyNode, isInNestedFunction } from '../utils';

/** Browser-only globals that are not available during SSR. */
const BROWSER_ONLY_GLOBALS = new Set([
  'localStorage',
  'sessionStorage',
  'navigator',
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
]);

/** Document properties that are browser-only (not covered by the SSR DOM shim). */
const BROWSER_ONLY_DOCUMENT_PROPS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'cookie',
]);

/**
 * Detect browser-only API usage at component top level that would crash during SSR.
 *
 * Flags globals like `localStorage`, `navigator`, observer constructors, and
 * browser-only `document` properties when used outside of callbacks (arrow
 * functions, function expressions). Usage inside `onMount()`, event handlers,
 * or any nested function is safe and not flagged.
 */
export class SSRSafetyDiagnostics {
  analyze(sourceFile: SourceFile, component: ComponentInfo): CompilerDiagnostic[] {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    const diagnostics: CompilerDiagnostic[] = [];

    bodyNode.forEachDescendant((node) => {
      if (!node.isKind(SyntaxKind.Identifier)) return;

      const name = node.getText();

      // Check for browser-only globals
      if (BROWSER_ONLY_GLOBALS.has(name)) {
        if (isInNestedFunction(node, bodyNode)) return;
        if (isInTypeofGuard(node)) return;

        const pos = sourceFile.getLineAndColumnAtPos(node.getStart());
        diagnostics.push({
          code: 'ssr-unsafe-api',
          message: `\`${name}\` is a browser-only API that is not available during SSR. Move it inside \`onMount()\` or wrap in a \`typeof\` guard.`,
          severity: 'warning',
          line: pos.line,
          column: pos.column - 1,
          fix: `Move the \`${name}\` usage inside \`onMount(() => { ... })\` or guard with \`typeof ${name} !== 'undefined'\`.`,
        });
        return;
      }

      // Check for browser-only document properties: document.querySelector, etc.
      if (name === 'document') {
        const parent = node.getParent();
        if (
          parent?.isKind(SyntaxKind.PropertyAccessExpression) &&
          parent.getExpression() === node
        ) {
          const propName = parent.getName();
          if (BROWSER_ONLY_DOCUMENT_PROPS.has(propName)) {
            if (isInNestedFunction(node, bodyNode)) return;
            if (isInTypeofGuard(node)) return;

            const pos = sourceFile.getLineAndColumnAtPos(node.getStart());
            diagnostics.push({
              code: 'ssr-unsafe-api',
              message: `\`document.${propName}\` is a browser-only API that is not available during SSR. Move it inside \`onMount()\` or wrap in a \`typeof\` guard.`,
              severity: 'warning',
              line: pos.line,
              column: pos.column - 1,
              fix: `Move the \`document.${propName}\` usage inside \`onMount(() => { ... })\`.`,
            });
          }
        }
      }
    });

    return diagnostics;
  }
}

/**
 * Check if the node is guarded by a typeof check.
 *
 * Covers four patterns:
 * 1. Direct operand: `typeof localStorage`
 * 2. If-block guard: `if (typeof localStorage !== 'undefined') { localStorage.getItem(...) }`
 * 3. Ternary guard: `typeof localStorage !== 'undefined' ? localStorage.getItem(...) : null`
 * 4. Logical AND guard: `typeof localStorage !== 'undefined' && localStorage.setItem(...)`
 */
function isInTypeofGuard(node: Node): boolean {
  // Pattern 1: direct typeof operand
  const parent = node.getParent();
  if (parent?.isKind(SyntaxKind.TypeOfExpression)) return true;

  const name = node.getText();

  // Walk up to find an enclosing guard construct
  let current: Node | undefined = node.getParent();
  while (current) {
    // Pattern 2: if (typeof X !== 'undefined') { ...X... }
    // Only suppress the then-branch, not the else-branch
    if (current.isKind(SyntaxKind.IfStatement)) {
      const condition = current.getExpression();
      const thenStatement = current.getThenStatement();
      if (conditionContainsTypeofFor(condition, name)) {
        if (isDescendantOf(node, thenStatement)) return true;
      }
      if (conditionContainsTypeofFor(condition, 'window')) {
        if (isDescendantOf(node, thenStatement)) return true;
      }
    }

    // Pattern 3: typeof X !== 'undefined' ? X : fallback
    if (current.isKind(SyntaxKind.ConditionalExpression)) {
      const condition = current.getCondition();
      if (conditionContainsTypeofFor(condition, name)) {
        const whenTrue = current.getWhenTrue();
        if (isDescendantOf(node, whenTrue)) return true;
      }
      if (conditionContainsTypeofFor(condition, 'window')) {
        const whenTrue = current.getWhenTrue();
        if (isDescendantOf(node, whenTrue)) return true;
      }
    }

    // Pattern 4: typeof X !== 'undefined' && X.method()
    if (current.isKind(SyntaxKind.BinaryExpression)) {
      const op = current.getOperatorToken();
      if (op.getKind() === SyntaxKind.AmpersandAmpersandToken) {
        const left = current.getLeft();
        if (conditionContainsTypeofFor(left, name)) {
          if (isDescendantOf(node, current.getRight())) return true;
        }
        if (conditionContainsTypeofFor(left, 'window')) {
          if (isDescendantOf(node, current.getRight())) return true;
        }
      }
    }

    current = current.getParent();
  }

  return false;
}

/** Check if a condition expression contains `typeof <name>`. */
function conditionContainsTypeofFor(condition: Node, name: string): boolean {
  if (condition.isKind(SyntaxKind.TypeOfExpression)) {
    return condition.getExpression().getText() === name;
  }
  // Check inside binary expressions: typeof X !== 'undefined'
  for (const desc of condition.getDescendantsOfKind(SyntaxKind.TypeOfExpression)) {
    if (desc.getExpression().getText() === name) return true;
  }
  return false;
}

/** Check if `node` is a descendant of `ancestor`. */
function isDescendantOf(node: Node, ancestor: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (current === ancestor) return true;
    current = current.getParent();
  }
  return false;
}
