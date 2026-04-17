import type MagicString from 'magic-string';
import ts from 'typescript';

/**
 * Inject stable IDs into createContext() calls for HMR support.
 *
 * Detects `const X = createContext(...)` patterns and injects a `__stableId`
 * argument so the context registry survives bundle re-evaluation.
 * The ID format is `filePath::varName` — unique because file paths are unique
 * and variable names are unique within a file.
 */
export function injectContextStableIds(
  source: MagicString,
  sourceFile: ts.SourceFile,
  relFilePath: string,
): void {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
      const callText = decl.initializer.expression.getText(sourceFile);
      if (callText !== 'createContext') continue;
      if (!ts.isIdentifier(decl.name)) continue;

      const varName = decl.name.text;
      const escapedPath = relFilePath.replace(/['\\]/g, '\\$&');
      const stableId = `${escapedPath}::${varName}`;
      const callExpr = decl.initializer;

      // Insert the stable ID as the last argument
      const argsArr = callExpr.arguments;
      if (argsArr.length === 0) {
        // createContext<T>() → createContext<T>(undefined, 'id')
        const closeParenPos = callExpr.end - 1;
        source.appendLeft(closeParenPos, `undefined, '${stableId}'`);
      } else {
        // createContext<T>(defaultValue) → createContext<T>(defaultValue, 'id')
        const lastArg = argsArr[argsArr.length - 1];
        if (lastArg) source.appendLeft(lastArg.end, `, '${stableId}'`);
      }
    }
  }
}
