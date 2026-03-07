/**
 * Manifest generator — produces a ReactivityManifest for a single file.
 *
 * Uses the raw TypeScript Compiler API (ts.createSourceFile) for performance.
 * No ts-morph, no Program, no type checker. Pure AST pattern matching.
 *
 * @see plans/cross-file-reactivity-analysis.md Section 2.2.2
 */
import { ts } from 'ts-morph';
import type { ExportReactivityInfo, ReactivityManifest, ReactivityShape } from './types';

/** Known framework APIs whose reactivity shapes are pre-defined. */
const FRAMEWORK_REACTIVE_APIS: Record<string, ReactivityShape> = {
  query: {
    type: 'signal-api',
    signalProperties: ['data', 'loading', 'error', 'revalidating'],
    plainProperties: ['refetch', 'revalidate', 'dispose'],
  },
  form: {
    type: 'signal-api',
    signalProperties: ['submitting', 'dirty', 'valid'],
    plainProperties: ['action', 'method', 'onSubmit', 'reset', 'setFieldError', 'submit'],
    fieldSignalProperties: ['value', 'error', 'dirty', 'touched'],
  },
  createLoader: {
    type: 'signal-api',
    signalProperties: ['data', 'loading', 'error'],
    plainProperties: ['refetch'],
  },
  signal: { type: 'signal' },
  useContext: { type: 'reactive-source' },
};

/**
 * Result of analyzing a single file for manifest generation.
 * Includes both the manifest and metadata needed for cross-file propagation.
 */
export interface FileAnalysis {
  manifest: ReactivityManifest;
  /** Imports this file uses: { localName, originalName, moduleSpecifier } */
  imports: ImportRef[];
  /** Re-exports: { exportName, originalName, moduleSpecifier } */
  reExports: ReExportRef[];
}

export interface ImportRef {
  localName: string;
  originalName: string;
  moduleSpecifier: string;
}

export interface ReExportRef {
  exportName: string;
  originalName: string;
  moduleSpecifier: string;
}

/**
 * Generate a ReactivityManifest for a single file from its source text.
 *
 * This performs single-file analysis only. Cross-file propagation
 * (following imports to resolve shapes) is done by the resolver.
 */
export function analyzeFile(filePath: string, sourceText: string): FileAnalysis {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  const imports: ImportRef[] = [];
  const reExports: ReExportRef[] = [];
  const exports: Record<string, ExportReactivityInfo> = {};

  // Track local variables assigned from known API calls
  const localVarShapes = new Map<string, ReactivityShape>();
  // Track which imports map to which API names
  const importedApis = new Map<string, string>(); // localName → originalName

  // First pass: collect imports
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const moduleSpecifier = stripQuotes(stmt.moduleSpecifier.getText(sourceFile));
      const clause = stmt.importClause;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const originalName = el.propertyName?.getText(sourceFile) ?? el.name.getText(sourceFile);
          const localName = el.name.getText(sourceFile);
          imports.push({ localName, originalName, moduleSpecifier });

          // Track framework API imports for local variable resolution
          if (FRAMEWORK_REACTIVE_APIS[originalName]) {
            importedApis.set(localName, originalName);
          }
        }
      }
    }
  }

  // Second pass: analyze exports
  for (const stmt of sourceFile.statements) {
    // export function foo() { ... }
    if (ts.isFunctionDeclaration(stmt) && hasExportModifier(stmt)) {
      const name = stmt.name?.getText(sourceFile);
      if (name) {
        exports[name] = analyzeFunctionDeclaration(stmt, sourceFile, importedApis);
      }
      continue;
    }

    // export const foo = ...
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.getText(sourceFile);
          const info = analyzeVariableDeclaration(decl, sourceFile, importedApis);
          exports[name] = info;
          // Track local shape for same-file resolution
          localVarShapes.set(name, info.reactivity);
        }
      }
      continue;
    }

    // export { foo, bar } or export { foo as bar }
    if (ts.isExportDeclaration(stmt)) {
      const moduleSpecifier = stmt.moduleSpecifier
        ? stripQuotes(stmt.moduleSpecifier.getText(sourceFile))
        : undefined;

      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const originalName =
            el.propertyName?.getText(sourceFile) ?? el.name.getText(sourceFile);
          const exportName = el.name.getText(sourceFile);

          if (moduleSpecifier) {
            // Re-export from another module: export { foo } from './bar'
            reExports.push({ exportName, originalName, moduleSpecifier });
          } else {
            // Local re-export: export { foo }
            // Try to resolve from local variable shapes
            const localShape = localVarShapes.get(originalName);
            if (localShape) {
              exports[exportName] = { kind: 'variable', reactivity: localShape };
            }
            // Otherwise left unresolved — the resolver will handle it
          }
        }
      } else if (stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
        // export * as ns from './bar' — skip for now
      } else if (!stmt.exportClause && moduleSpecifier) {
        // export * from './bar' — star re-export
        reExports.push({ exportName: '*', originalName: '*', moduleSpecifier });
      }
      continue;
    }

    // Non-exported variable statements — track locally for same-file resolution
    if (ts.isVariableStatement(stmt) && !hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const name = decl.name.getText(sourceFile);
          const shape = inferInitializerShape(decl.initializer, sourceFile, importedApis);
          if (shape) {
            localVarShapes.set(name, shape);
          }
        }
      }
    }
  }

  return {
    manifest: { version: 1, filePath, exports },
    imports,
    reExports,
  };
}

function analyzeFunctionDeclaration(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
): ExportReactivityInfo {
  if (!node.body) {
    return { kind: 'function', reactivity: { type: 'unknown' } };
  }

  // Check if this is a component (returns JSX)
  if (isComponentFunction(node, sourceFile)) {
    return { kind: 'component', reactivity: { type: 'static' } };
  }

  const returnShape = inferFunctionReturnShape(node.body, sourceFile, importedApis);
  return { kind: 'function', reactivity: returnShape };
}

function analyzeVariableDeclaration(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
): ExportReactivityInfo {
  if (!decl.initializer) {
    return { kind: 'variable', reactivity: { type: 'unknown' } };
  }

  const init = decl.initializer;

  // Arrow function or function expression
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
    if (isComponentFunction(init, sourceFile)) {
      return { kind: 'component', reactivity: { type: 'static' } };
    }

    if (init.body && ts.isBlock(init.body)) {
      const returnShape = inferFunctionReturnShape(init.body, sourceFile, importedApis);
      return { kind: 'function', reactivity: returnShape };
    }

    // Concise arrow: () => expr
    if (init.body && !ts.isBlock(init.body)) {
      const shape = inferExpressionShape(init.body, sourceFile, importedApis);
      return { kind: 'function', reactivity: shape ?? { type: 'unknown' } };
    }

    return { kind: 'function', reactivity: { type: 'unknown' } };
  }

  // Direct call expression: const foo = query(...)
  const shape = inferInitializerShape(init, sourceFile, importedApis);
  if (shape) {
    return { kind: 'variable', reactivity: shape };
  }

  return { kind: 'variable', reactivity: { type: 'static' } };
}

/**
 * Infer the reactivity shape of a function body by analyzing return statements.
 *
 * If there are multiple return paths with different shapes, uses the most reactive.
 */
function inferFunctionReturnShape(
  body: ts.Block,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
): ReactivityShape {
  // Track local variables in the function body
  const localVars = new Map<string, ReactivityShape>();

  // First, scan for local variable assignments
  for (const stmt of body.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const name = decl.name.getText(sourceFile);
          const shape = inferExpressionShape(decl.initializer, sourceFile, importedApis);
          if (shape) {
            localVars.set(name, shape);
          }
        }
      }
    }
  }

  // Then analyze return statements
  const returnShapes: ReactivityShape[] = [];
  collectReturnShapes(body, sourceFile, importedApis, localVars, returnShapes);

  if (returnShapes.length === 0) {
    return { type: 'static' };
  }

  // Use the most reactive shape (conservative)
  return mostReactiveShape(returnShapes);
}

function collectReturnShapes(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
  localVars: Map<string, ReactivityShape>,
  shapes: ReactivityShape[],
): void {
  // Don't descend into nested function bodies
  if (
    node !== node &&
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node))
  ) {
    return;
  }

  if (ts.isReturnStatement(node) && node.expression) {
    const shape = inferExpressionShape(node.expression, sourceFile, importedApis, localVars);
    if (shape) {
      shapes.push(shape);
    } else {
      shapes.push({ type: 'static' });
    }
  }

  ts.forEachChild(node, (child) => {
    // Skip nested function bodies
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child)
    ) {
      return;
    }
    collectReturnShapes(child, sourceFile, importedApis, localVars, shapes);
  });
}

/**
 * Infer the reactivity shape of an expression.
 * Returns null if the expression has no recognizable reactive shape.
 */
function inferExpressionShape(
  expr: ts.Expression,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
  localVars?: Map<string, ReactivityShape>,
): ReactivityShape | null {
  // Unwrap parentheses, as, satisfies, non-null assertions
  expr = unwrapExpression(expr);

  // Call expression: query(...), useContext(...), etc.
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee)) {
      const calleeName = callee.getText(sourceFile);
      const apiName = importedApis.get(calleeName);
      if (apiName && FRAMEWORK_REACTIVE_APIS[apiName]) {
        return FRAMEWORK_REACTIVE_APIS[apiName];
      }
      // Check local variable (same-file function call)
      if (localVars?.has(calleeName)) {
        return localVars.get(calleeName)!;
      }
    }
    return null;
  }

  // Identifier: return someVar
  if (ts.isIdentifier(expr)) {
    const name = expr.getText(sourceFile);
    if (localVars?.has(name)) {
      return localVars.get(name)!;
    }
    return null;
  }

  // Conditional: cond ? exprA : exprB — use most reactive
  if (ts.isConditionalExpression(expr)) {
    const whenTrue = inferExpressionShape(expr.whenTrue, sourceFile, importedApis, localVars);
    const whenFalse = inferExpressionShape(expr.whenFalse, sourceFile, importedApis, localVars);
    const shapes = [whenTrue, whenFalse].filter((s): s is ReactivityShape => s !== null);
    return shapes.length > 0 ? mostReactiveShape(shapes) : null;
  }

  return null;
}

/**
 * Infer shape from a variable initializer (non-function).
 * Used for: const foo = query(...), const bar = someReactiveVar, etc.
 */
function inferInitializerShape(
  init: ts.Expression,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
): ReactivityShape | null {
  init = unwrapExpression(init);

  if (ts.isCallExpression(init)) {
    const callee = init.expression;
    if (ts.isIdentifier(callee)) {
      const calleeName = callee.getText(sourceFile);
      const apiName = importedApis.get(calleeName);
      if (apiName && FRAMEWORK_REACTIVE_APIS[apiName]) {
        return FRAMEWORK_REACTIVE_APIS[apiName];
      }
    }
  }

  return null;
}

/** Check if a function returns JSX (component detection). */
function isComponentFunction(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
): boolean {
  // Check function name starts with uppercase (convention for components)
  let name: string | undefined;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    name = node.name?.getText(sourceFile);
  }
  // For arrow functions, we can't check the name here — the caller handles it

  if (name && !/^[A-Z]/.test(name)) {
    return false;
  }

  // Check if body contains JSX returns
  if (node.body) {
    return containsJsxReturn(node.body, sourceFile);
  }
  return false;
}

function containsJsxReturn(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (ts.isReturnStatement(node) && node.expression) {
    return isJsxExpression(node.expression);
  }

  // Concise arrow body
  if (isJsxExpression(node)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    // Don't descend into nested functions
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child)
    ) {
      return;
    }
    if (containsJsxReturn(child, sourceFile)) {
      found = true;
    }
  });
  return found;
}

function isJsxExpression(node: ts.Node): boolean {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node) ||
    ts.isParenthesizedExpression(node) && isJsxExpression(node.expression)
  );
}

/** Unwrap TypeScript syntax wrappers (parentheses, as, satisfies, non-null). */
function unwrapExpression(expr: ts.Expression): ts.Expression {
  while (true) {
    if (ts.isParenthesizedExpression(expr)) {
      expr = expr.expression;
    } else if (ts.isAsExpression(expr)) {
      expr = expr.expression;
    } else if (ts.isSatisfiesExpression(expr)) {
      expr = expr.expression;
    } else if (ts.isNonNullExpression(expr)) {
      expr = expr.expression;
    } else if (ts.isTypeAssertionExpression(expr)) {
      expr = expr.expression;
    } else {
      return expr;
    }
  }
}

function hasExportModifier(node: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function stripQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, '');
}

/** Rank reactivity shapes from most to least reactive. */
const REACTIVITY_RANK: Record<string, number> = {
  'signal-api': 4,
  'reactive-source': 3,
  signal: 2,
  unknown: 1,
  static: 0,
};

function mostReactiveShape(shapes: ReactivityShape[]): ReactivityShape {
  let best = shapes[0];
  let bestRank = REACTIVITY_RANK[best.type] ?? 0;

  for (let i = 1; i < shapes.length; i++) {
    const rank = REACTIVITY_RANK[shapes[i].type] ?? 0;
    if (rank > bestRank) {
      best = shapes[i];
      bestRank = rank;
    }
  }

  return best;
}
