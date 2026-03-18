import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo } from './types';

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Quote a property name if it's not a valid JS identifier (e.g. hyphenated names). */
export function quoteIfNeeded(name: string): string {
  return VALID_IDENTIFIER_RE.test(name) ? name : JSON.stringify(name);
}

/** Find the function body Block node for a component using body position range. */
export function findBodyNode(sourceFile: SourceFile, component: ComponentInfo): Node | null {
  const allBlocks = sourceFile.getDescendantsOfKind(SyntaxKind.Block);
  for (const block of allBlocks) {
    if (block.getStart() === component.bodyStart && block.getEnd() === component.bodyEnd) {
      return block;
    }
  }
  return null;
}

/** Check if the node is inside a nested function/method between it and the boundary node. */
export function isInNestedFunction(node: Node, boundaryNode: Node): boolean {
  let current = node.getParent();
  while (current && current !== boundaryNode) {
    if (isFunctionLike(current)) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

function isFunctionLike(node: Node): boolean {
  return (
    node.isKind(SyntaxKind.ArrowFunction) ||
    node.isKind(SyntaxKind.FunctionExpression) ||
    node.isKind(SyntaxKind.FunctionDeclaration) ||
    node.isKind(SyntaxKind.MethodDeclaration) ||
    node.isKind(SyntaxKind.Constructor) ||
    node.isKind(SyntaxKind.GetAccessor) ||
    node.isKind(SyntaxKind.SetAccessor)
  );
}

/**
 * Check if an identifier is shadowed by a declaration in a nested scope
 * between the identifier and the component body boundary.
 *
 * Walks up from the node to bodyNode. At each function boundary, checks
 * if the function has a parameter with the same name. At each block scope,
 * checks if a variable declaration with the same name exists.
 *
 * This prevents signal/computed transforms from incorrectly adding .value
 * to callback-local variables or parameters that shadow component-level names.
 */
export function isShadowedInNestedScope(node: Node, name: string, bodyNode: Node): boolean {
  let current = node.getParent();
  while (current && current !== bodyNode) {
    // Check function parameters
    if (isFunctionLike(current)) {
      const fn = current;
      if ('getParameters' in fn && typeof fn.getParameters === 'function') {
        for (const param of fn.getParameters()) {
          const nameNode = param.getNameNode();
          if (nameNode.isKind(SyntaxKind.Identifier) && nameNode.getText() === name) {
            return true;
          }
          // Check destructured parameters
          if (nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
            for (const el of nameNode.getElements()) {
              if (el.getName() === name) return true;
            }
          }
          if (nameNode.isKind(SyntaxKind.ArrayBindingPattern)) {
            for (const el of nameNode.getElements()) {
              if (el.isKind(SyntaxKind.BindingElement) && el.getName() === name) return true;
            }
          }
        }
      }
    }

    // Check variable declarations in blocks
    if (current.isKind(SyntaxKind.Block)) {
      for (const stmt of current.getStatements()) {
        // Only check statements that appear BEFORE the node's position
        // to handle temporal dead zone correctly. But for correctness of
        // shadowing analysis, any declaration in the block means the name
        // is local to this scope (hoisting for let/const creates TDZ, not
        // access to outer scope).
        if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
        const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
        if (!declList) continue;
        for (const decl of declList.getDeclarations()) {
          const declName = decl.getNameNode();
          if (declName.isKind(SyntaxKind.Identifier) && declName.getText() === name) {
            return true;
          }
        }
      }
    }

    current = current.getParent();
  }
  return false;
}
