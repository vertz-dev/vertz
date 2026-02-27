/**
 * CSS Analyzer — Extract css() calls from source and classify as static vs reactive.
 *
 * A css() call is "static" if all arguments are string literals, array literals
 * of string literals, and object literals with string literal values.
 * Any dynamic expression (variable references, function calls, template literals
 * with expressions) makes it "reactive" and prevents compile-time extraction.
 */

import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';

/** Classification of a css() call. */
export type CSSCallKind = 'static' | 'reactive';

/** Information about a detected css() call. */
export interface CSSCallInfo {
  /** Whether the call can be fully resolved at compile time. */
  kind: CSSCallKind;
  /** 0-based start position of the entire css() call expression. */
  start: number;
  /** 0-based end position of the entire css() call expression. */
  end: number;
  /** 1-based line number. */
  line: number;
  /** 0-based column. */
  column: number;
  /** The raw source text of the css() call. */
  text: string;
  /** For static calls: the parsed block names. */
  blockNames: string[];
}

/**
 * Analyze a source file for css() calls.
 */
export class CSSAnalyzer {
  analyze(sourceFile: SourceFile): CSSCallInfo[] {
    const results: CSSCallInfo[] = [];

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expression = call.getExpression();

      // Match `css(...)` calls
      if (expression.isKind(SyntaxKind.Identifier) && expression.getText() === 'css') {
        const args = call.getArguments();
        if (args.length === 0) continue;

        const firstArg = args[0] as Node;
        const kind = this.classifyArgument(firstArg);
        const blockNames = kind === 'static' ? this.extractBlockNames(firstArg) : [];

        const pos = sourceFile.getLineAndColumnAtPos(call.getStart());

        results.push({
          kind,
          start: call.getStart(),
          end: call.getEnd(),
          line: pos.line,
          column: pos.column - 1,
          text: call.getText(),
          blockNames,
        });
      }
    }

    return results;
  }

  /** Classify whether a css() argument is fully static. */
  private classifyArgument(node: Node): CSSCallKind {
    // Must be an object literal
    if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) {
      return 'reactive';
    }

    for (const prop of node.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
        return 'reactive'; // spread, method, etc.
      }

      const initializer = prop.getInitializer();
      if (!initializer) return 'reactive';

      // Must be an array literal
      if (!initializer.isKind(SyntaxKind.ArrayLiteralExpression)) {
        return 'reactive';
      }

      // Each element must be a string literal or static object
      for (const element of initializer.getElements()) {
        if (element.isKind(SyntaxKind.StringLiteral)) {
          continue;
        }
        if (element.isKind(SyntaxKind.ObjectLiteralExpression)) {
          if (!this.isStaticNestedObject(element)) {
            return 'reactive';
          }
          continue;
        }
        return 'reactive';
      }
    }

    return 'static';
  }

  /** Check if a nested object (for complex selectors) is fully static. */
  private isStaticNestedObject(node: Node): boolean {
    if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return false;

    for (const prop of node.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;

      const init = prop.getInitializer();
      if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) return false;

      for (const el of init.getElements()) {
        if (el.isKind(SyntaxKind.StringLiteral)) continue;
        // Accept raw declaration objects: { property: '...', value: '...' }
        if (el.isKind(SyntaxKind.ObjectLiteralExpression)) {
          if (this.isStaticRawDeclaration(el)) continue;
          return false;
        }
        return false;
      }
    }

    return true;
  }

  /** Check if a node is a static raw declaration: { property: '...', value: '...' } */
  private isStaticRawDeclaration(node: Node): boolean {
    if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return false;
    const props = node.getProperties();
    if (props.length !== 2) return false;

    let hasProperty = false;
    let hasValue = false;
    for (const prop of props) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;
      const init = prop.getInitializer();
      if (!init || !init.isKind(SyntaxKind.StringLiteral)) return false;
      const name = prop.getName();
      if (name === 'property') hasProperty = true;
      else if (name === 'value') hasValue = true;
    }
    return hasProperty && hasValue;
  }

  /** Extract block names from a static css() argument. */
  private extractBlockNames(node: Node): string[] {
    if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

    const names: string[] = [];
    for (const prop of node.getProperties()) {
      if (prop.isKind(SyntaxKind.PropertyAssignment)) {
        const name = prop.getName();
        names.push(name);
      }
    }
    return names;
  }
}
