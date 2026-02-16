/**
 * CSS Analyzer — Extract css() calls from source and classify as static vs reactive.
 *
 * A css() call is "static" if all arguments are string literals, array literals
 * of string literals, and object literals with string literal values.
 * Any dynamic expression (variable references, function calls, template literals
 * with expressions) makes it "reactive" and prevents compile-time extraction.
 */
import { SyntaxKind } from 'ts-morph';
/**
 * Analyze a source file for css() calls.
 */
export class CSSAnalyzer {
  analyze(sourceFile) {
    const results = [];
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExpressions) {
      const expression = call.getExpression();
      // Match `css(...)` calls
      if (expression.isKind(SyntaxKind.Identifier) && expression.getText() === 'css') {
        const args = call.getArguments();
        if (args.length === 0) continue;
        const firstArg = args[0];
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
  classifyArgument(node) {
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
  isStaticNestedObject(node) {
    if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return false;
    for (const prop of node.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;
      const init = prop.getInitializer();
      if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) return false;
      for (const el of init.getElements()) {
        if (!el.isKind(SyntaxKind.StringLiteral)) return false;
      }
    }
    return true;
  }
  /** Extract block names from a static css() argument. */
  extractBlockNames(node) {
    if (!node.isKind(SyntaxKind.ObjectLiteralExpression)) return [];
    const names = [];
    for (const prop of node.getProperties()) {
      if (prop.isKind(SyntaxKind.PropertyAssignment)) {
        const name = prop.getName();
        names.push(name);
      }
    }
    return names;
  }
}
//# sourceMappingURL=css-analyzer.js.map
