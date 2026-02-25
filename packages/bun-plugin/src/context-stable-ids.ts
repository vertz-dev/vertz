import type MagicString from 'magic-string';
import { ts } from 'ts-morph';
import type { SourceFile } from 'ts-morph';

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
  sourceFile: SourceFile,
  relFilePath: string,
): void {
  for (const stmt of sourceFile.getStatements()) {
    if (!ts.isVariableStatement(stmt.compilerNode)) continue;
    for (const decl of stmt.compilerNode.declarationList.declarations) {
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
      const callText = decl.initializer.expression.getText(sourceFile.compilerNode);
      if (callText !== 'createContext') continue;
      if (!ts.isIdentifier(decl.name)) continue;

      const varName = decl.name.text;
      const stableId = `${relFilePath}::${varName}`;
      const callExpr = decl.initializer;

      // Insert the stable ID as the last argument
      const argsArr = callExpr.arguments;
      if (argsArr.length === 0) {
        // createContext<T>() → createContext<T>(undefined, 'id')
        const closeParenPos = callExpr.end - 1;
        source.appendLeft(closeParenPos, `undefined, '${stableId}'`);
      } else {
        // createContext<T>(defaultValue) → createContext<T>(defaultValue, 'id')
        const lastArg = argsArr[argsArr.length - 1]!;
        source.appendLeft(lastArg.end, `, '${stableId}'`);
      }
    }
  }
}
