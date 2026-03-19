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
 *   __pushMountFrame();
 *   try {
 *     ...body...
 *     const __mfResult = /* JSX IIFE * /;
 *     __flushMountFrame();
 *     return __mfResult;
 *   } catch (__mfErr) {
 *     __discardMountFrame();
 *     throw __mfErr;
 *   }
 * }
 * ```
 */
export class MountFrameTransformer {
  transform(source: MagicString, sourceFile: SourceFile, component: ComponentInfo): void {
    const bodyNode = findBodyNode(sourceFile, component);

    if (bodyNode && bodyNode.isKind(SyntaxKind.Block)) {
      this._transformBlockBody(source, sourceFile, component, bodyNode);
    } else {
      // Arrow function with expression body
      this._transformExpressionBody(source, component);
    }
  }

  private _transformBlockBody(
    source: MagicString,
    _sourceFile: SourceFile,
    component: ComponentInfo,
    bodyNode: Node,
  ): void {
    // Find return statements that are direct children of this body (not nested functions)
    const returnStatements = this._findDirectReturnStatements(bodyNode);

    if (returnStatements.length === 0) return;

    // Insert __pushMountFrame() + try { after the opening brace
    const openBrace = component.bodyStart; // Position of '{'
    source.appendRight(openBrace + 1, '\n__pushMountFrame();\ntry {');

    // Wrap each return statement: return <expr> → const __mfResult = <expr>; __flushMountFrame(); return __mfResult;
    for (const ret of returnStatements as ReturnStatement[]) {
      const expr = ret.getExpression();
      if (!expr) continue; // bare `return;` — no mount frame interaction

      const retStart = ret.getStart();
      const retEnd = ret.getEnd();

      // Read the expression text from MagicString (includes prior transforms)
      const exprText = source.slice(expr.getStart(), expr.getEnd());

      // Replace `return <expr>;` with `const __mfResult = <expr>; __flushMountFrame(); return __mfResult;`
      source.overwrite(
        retStart,
        retEnd,
        `const __mfResult = ${exprText};\n__flushMountFrame();\nreturn __mfResult;`,
      );
    }

    // Insert catch + closing braces before the function body close
    const closeBrace = component.bodyEnd - 1; // Position before '}'
    source.appendLeft(
      closeBrace,
      '\n} catch (__mfErr) {\n__discardMountFrame();\nthrow __mfErr;\n}\n',
    );
  }

  private _transformExpressionBody(source: MagicString, component: ComponentInfo): void {
    // Arrow with expression body: const Comp = () => <div/>
    // After JSX transform, the expression is an IIFE: (() => { ... })()
    // We need to convert to block body: () => { __pushMountFrame(); try { ... } catch ... }
    const bodyStart = component.bodyStart;
    const bodyEnd = component.bodyEnd;

    const exprText = source.slice(bodyStart, bodyEnd);

    source.overwrite(
      bodyStart,
      bodyEnd,
      `{\n__pushMountFrame();\ntry {\nconst __mfResult = ${exprText};\n__flushMountFrame();\nreturn __mfResult;\n} catch (__mfErr) {\n__discardMountFrame();\nthrow __mfErr;\n}\n}`,
    );
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

      // Don't recurse into nested functions
      if (
        node.isKind(SyntaxKind.ArrowFunction) ||
        node.isKind(SyntaxKind.FunctionExpression) ||
        node.isKind(SyntaxKind.FunctionDeclaration)
      ) {
        return;
      }

      for (const child of node.getChildren()) {
        walk(child);
      }
    }

    // Walk the body's children (skip the body node itself)
    for (const child of bodyNode.getChildren()) {
      walk(child);
    }

    return results;
  }
}
