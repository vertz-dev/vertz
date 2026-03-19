import type MagicString from 'magic-string';
import { type Node, type ReturnStatement, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Inject __pushMountFrame / __flushMountFrame / __discardMountFrame into
 * component functions so that onMount callbacks are deferred until after
 * the JSX IIFE evaluates (refs are set, elements created).
 *
 * Runs AFTER the JSX transformer — it operates on MagicString that already
 * contains IIFE return expressions.
 *
 * Generated pattern (block body):
 * ```
 * function Comp() {
 *   const __mfDepth = __pushMountFrame();
 *   try {
 *     ...body...
 *     const __mfResult0 = <JSX IIFE>;
 *     __flushMountFrame();
 *     return __mfResult0;
 *   } catch (__mfErr) {
 *     __discardMountFrame(__mfDepth);
 *     throw __mfErr;
 *   }
 * }
 * ```
 */
export class MountFrameTransformer {
  transform(source: MagicString, sourceFile: SourceFile, component: ComponentInfo): void {
    const bodyNode = findBodyNode(sourceFile, component);

    if (bodyNode && bodyNode.isKind(SyntaxKind.Block)) {
      this._transformBlockBody(source, component, bodyNode);
    } else {
      // Arrow function with expression body
      this._transformExpressionBody(source, component);
    }
  }

  private _transformBlockBody(source: MagicString, component: ComponentInfo, bodyNode: Node): void {
    const returnStatements = this._findDirectReturnStatements(bodyNode);
    if (returnStatements.length === 0) return;

    // Insert __pushMountFrame() + try { after the opening brace
    const openBrace = component.bodyStart;
    source.appendRight(openBrace + 1, '\nconst __mfDepth = __pushMountFrame();\ntry {');

    // Wrap each return statement
    let resultIdx = 0;
    for (const ret of returnStatements) {
      const expr = ret.getExpression();
      const retStart = ret.getStart();
      const retEnd = ret.getEnd();

      // Check if this return is inside a braceless control flow statement
      const needsBraces = this._isInBracelessControlFlow(ret);

      if (!expr) {
        // Bare `return;` — flush (empty frame, effectively a no-op) before returning
        const replacement = needsBraces
          ? '{ __flushMountFrame(); return; }'
          : '__flushMountFrame();\nreturn;';
        source.overwrite(retStart, retEnd, replacement);
      } else {
        const varName = `__mfResult${resultIdx++}`;
        const exprText = source.slice(expr.getStart(), expr.getEnd());
        const replacement = needsBraces
          ? `{ const ${varName} = ${exprText};\n__flushMountFrame();\nreturn ${varName}; }`
          : `const ${varName} = ${exprText};\n__flushMountFrame();\nreturn ${varName};`;
        source.overwrite(retStart, retEnd, replacement);
      }
    }

    // Insert catch + closing braces before the function body close
    const closeBrace = component.bodyEnd - 1;
    source.appendLeft(
      closeBrace,
      '\n} catch (__mfErr) {\n__discardMountFrame(__mfDepth);\nthrow __mfErr;\n}\n',
    );
  }

  private _transformExpressionBody(source: MagicString, component: ComponentInfo): void {
    const bodyStart = component.bodyStart;
    const bodyEnd = component.bodyEnd;
    const exprText = source.slice(bodyStart, bodyEnd);

    source.overwrite(
      bodyStart,
      bodyEnd,
      `{\nconst __mfDepth = __pushMountFrame();\ntry {\nconst __mfResult0 = ${exprText};\n__flushMountFrame();\nreturn __mfResult0;\n} catch (__mfErr) {\n__discardMountFrame(__mfDepth);\nthrow __mfErr;\n}\n}`,
    );
  }

  /**
   * Check whether a ReturnStatement is the direct body of a braceless
   * control flow statement (if/else/for/while). In that case, the
   * multi-statement replacement needs wrapping in { }.
   */
  private _isInBracelessControlFlow(ret: ReturnStatement): boolean {
    const parent = ret.getParent();
    if (!parent) return false;

    // Check if parent is an if/else/for/while/do and this return is
    // the "then" or "else" branch body (not inside a block)
    if (parent.isKind(SyntaxKind.IfStatement)) {
      const ifStmt = parent;
      // The return is either the thenStatement or elseStatement
      const thenStmt = ifStmt.getThenStatement();
      const elseStmt = ifStmt.getElseStatement();
      if (
        (thenStmt === ret && !thenStmt.isKind(SyntaxKind.Block)) ||
        (elseStmt === ret && !elseStmt.isKind(SyntaxKind.Block))
      ) {
        return true;
      }
    }

    if (
      parent.isKind(SyntaxKind.ForStatement) ||
      parent.isKind(SyntaxKind.ForInStatement) ||
      parent.isKind(SyntaxKind.ForOfStatement) ||
      parent.isKind(SyntaxKind.WhileStatement) ||
      parent.isKind(SyntaxKind.DoStatement)
    ) {
      // The return is the loop body
      if (!ret.isKind(SyntaxKind.Block)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find ReturnStatements that are direct children of the body block,
   * NOT inside nested functions. We only want returns from the component itself.
   */
  private _findDirectReturnStatements(bodyNode: Node): ReturnStatement[] {
    const results: ReturnStatement[] = [];

    function walk(node: Node): void {
      if (node.isKind(SyntaxKind.ReturnStatement)) {
        results.push(node as ReturnStatement);
        return;
      }

      // Don't recurse into nested functions (any function-like node)
      if (
        node.isKind(SyntaxKind.ArrowFunction) ||
        node.isKind(SyntaxKind.FunctionExpression) ||
        node.isKind(SyntaxKind.FunctionDeclaration) ||
        node.isKind(SyntaxKind.MethodDeclaration) ||
        node.isKind(SyntaxKind.GetAccessor) ||
        node.isKind(SyntaxKind.SetAccessor) ||
        node.isKind(SyntaxKind.Constructor)
      ) {
        return;
      }

      for (const child of node.getChildren()) {
        walk(child);
      }
    }

    for (const child of bodyNode.getChildren()) {
      walk(child);
    }

    return results;
  }
}
