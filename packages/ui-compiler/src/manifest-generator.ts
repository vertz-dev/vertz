/**
 * Manifest generator — produces a ReactivityManifest for a single file.
 *
 * Uses the raw TypeScript Compiler API (ts.createSourceFile) for performance.
 * Pure AST pattern matching — no Program, no type checker.
 *
 * @see plans/cross-file-reactivity-analysis.md Section 2.2.2
 */
import { ts } from 'ts-morph';
import {
  REACTIVE_SOURCE_APIS,
  SIGNAL_API_REGISTRY,
} from './signal-api-registry';
import type { ExportReactivityInfo, ReactivityManifest, ReactivityShape } from './types';

/**
 * Framework reactive API shapes derived from SIGNAL_API_REGISTRY.
 * Single source of truth — no duplication.
 */
const FRAMEWORK_REACTIVE_APIS: Record<string, ReactivityShape> = buildFrameworkApis();

function buildFrameworkApis(): Record<string, ReactivityShape> {
  const apis: Record<string, ReactivityShape> = {};

  for (const [name, config] of Object.entries(SIGNAL_API_REGISTRY)) {
    apis[name] = {
      type: 'signal-api',
      signalProperties: [...config.signalProperties],
      plainProperties: [...config.plainProperties],
      ...(config.fieldSignalProperties
        ? { fieldSignalProperties: [...config.fieldSignalProperties] }
        : {}),
    };
  }

  for (const name of REACTIVE_SOURCE_APIS) {
    apis[name] = { type: 'reactive-source' };
  }

  apis.signal = { type: 'signal' };

  return apis;
}

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

  // Track local declarations for same-file resolution
  const localVarShapes = new Map<string, ReactivityShape>();
  const localFnShapes = new Map<string, ExportReactivityInfo>();
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

          if (FRAMEWORK_REACTIVE_APIS[originalName]) {
            importedApis.set(localName, originalName);
          }
        }
      }
      // Track default imports
      if (clause?.name) {
        const localName = clause.name.getText(sourceFile);
        imports.push({ localName, originalName: 'default', moduleSpecifier });
      }
    }
  }

  // Second pass: analyze exports and track local declarations
  for (const stmt of sourceFile.statements) {
    // export function foo() { ... }
    if (ts.isFunctionDeclaration(stmt) && hasExportModifier(stmt)) {
      const name = stmt.name?.getText(sourceFile);
      if (name) {
        const info = analyzeFunctionDeclaration(stmt, sourceFile, importedApis);
        exports[name] = info;
        localFnShapes.set(name, info);
      }
      continue;
    }

    // export default function foo() { ... } or export default function() { ... }
    if (ts.isFunctionDeclaration(stmt) && hasDefaultExportModifier(stmt)) {
      const info = analyzeFunctionDeclaration(stmt, sourceFile, importedApis);
      exports.default = info;
      const name = stmt.name?.getText(sourceFile);
      if (name) {
        localFnShapes.set(name, info);
      }
      continue;
    }

    // export default <expression>
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const info = analyzeExpression(stmt.expression, sourceFile, importedApis);
      exports.default = info;
      continue;
    }

    // export const foo = ...
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.getText(sourceFile);
          const info = analyzeVariableDeclaration(decl, sourceFile, importedApis);
          exports[name] = info;
          localVarShapes.set(name, info.reactivity);
          if (info.kind === 'function') {
            localFnShapes.set(name, info);
          }
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
            reExports.push({ exportName, originalName, moduleSpecifier });
          } else {
            // Local re-export: export { foo }
            // Check local variables and functions
            const localShape = localVarShapes.get(originalName);
            if (localShape) {
              exports[exportName] = { kind: 'variable', reactivity: localShape };
            } else {
              const fnInfo = localFnShapes.get(originalName);
              if (fnInfo) {
                exports[exportName] = fnInfo;
              }
            }
          }
        }
      } else if (!stmt.exportClause && moduleSpecifier) {
        // export * from './bar' — star re-export
        reExports.push({ exportName: '*', originalName: '*', moduleSpecifier });
      }
      continue;
    }

    // Non-exported declarations — track locally for same-file resolution
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

    if (ts.isFunctionDeclaration(stmt) && !hasExportModifier(stmt) && !hasDefaultExportModifier(stmt)) {
      const name = stmt.name?.getText(sourceFile);
      if (name) {
        localFnShapes.set(name, analyzeFunctionDeclaration(stmt, sourceFile, importedApis));
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

  if (isComponentFunction(node, sourceFile)) {
    return { kind: 'component', reactivity: { type: 'static' } };
  }

  const returnShape = inferFunctionReturnShape(node.body, sourceFile, importedApis);
  return { kind: 'function', reactivity: returnShape };
}

/** Analyze a standalone expression (used for export default <expr>). */
function analyzeExpression(
  expr: ts.Expression,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
): ExportReactivityInfo {
  expr = unwrapExpression(expr);

  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    if (isComponentFunction(expr, sourceFile)) {
      return { kind: 'component', reactivity: { type: 'static' } };
    }
    if (expr.body && ts.isBlock(expr.body)) {
      const returnShape = inferFunctionReturnShape(expr.body, sourceFile, importedApis);
      return { kind: 'function', reactivity: returnShape };
    }
    if (expr.body && !ts.isBlock(expr.body)) {
      const shape = inferExpressionShape(expr.body, sourceFile, importedApis);
      return { kind: 'function', reactivity: shape ?? { type: 'unknown' } };
    }
    return { kind: 'function', reactivity: { type: 'unknown' } };
  }

  const shape = inferInitializerShape(expr, sourceFile, importedApis);
  if (shape) {
    return { kind: 'variable', reactivity: shape };
  }

  return { kind: 'variable', reactivity: { type: 'static' } };
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

  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
    if (isComponentFunction(init, sourceFile)) {
      return { kind: 'component', reactivity: { type: 'static' } };
    }

    if (init.body && ts.isBlock(init.body)) {
      const returnShape = inferFunctionReturnShape(init.body, sourceFile, importedApis);
      return { kind: 'function', reactivity: returnShape };
    }

    if (init.body && !ts.isBlock(init.body)) {
      const shape = inferExpressionShape(init.body, sourceFile, importedApis);
      return { kind: 'function', reactivity: shape ?? { type: 'unknown' } };
    }

    return { kind: 'function', reactivity: { type: 'unknown' } };
  }

  const shape = inferInitializerShape(init, sourceFile, importedApis);
  if (shape) {
    return { kind: 'variable', reactivity: shape };
  }

  return { kind: 'variable', reactivity: { type: 'static' } };
}

/**
 * Infer the reactivity shape of a function body by analyzing return statements.
 * If there are multiple return paths with different shapes, uses the most reactive.
 */
function inferFunctionReturnShape(
  body: ts.Block,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
): ReactivityShape {
  const localVars = new Map<string, ReactivityShape>();

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

  const returnShapes: ReactivityShape[] = [];
  collectReturnShapes(body, sourceFile, importedApis, localVars, returnShapes);

  if (returnShapes.length === 0) {
    return { type: 'static' };
  }

  return mostReactiveShape(returnShapes);
}

function collectReturnShapes(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importedApis: Map<string, string>,
  localVars: Map<string, ReactivityShape>,
  shapes: ReactivityShape[],
): void {
  if (ts.isReturnStatement(node) && node.expression) {
    const shape = inferExpressionShape(node.expression, sourceFile, importedApis, localVars);
    if (shape) {
      shapes.push(shape);
    } else {
      shapes.push({ type: 'static' });
    }
  }

  ts.forEachChild(node, (child) => {
    // Skip nested function/method bodies — their returns don't belong to us
    if (isNestedFunctionLike(child)) return;
    collectReturnShapes(child, sourceFile, importedApis, localVars, shapes);
  });
}

/** Check if a node is a nested function-like declaration that should not be descended into. */
function isNestedFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
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
  expr = unwrapExpression(expr);

  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee)) {
      const calleeName = callee.getText(sourceFile);
      const apiName = importedApis.get(calleeName);
      if (apiName && FRAMEWORK_REACTIVE_APIS[apiName]) {
        return FRAMEWORK_REACTIVE_APIS[apiName];
      }
      if (localVars?.has(calleeName)) {
        return localVars.get(calleeName)!;
      }
    }
    return null;
  }

  if (ts.isIdentifier(expr)) {
    const name = expr.getText(sourceFile);
    if (localVars?.has(name)) {
      return localVars.get(name)!;
    }
    return null;
  }

  if (ts.isConditionalExpression(expr)) {
    const whenTrue = inferExpressionShape(expr.whenTrue, sourceFile, importedApis, localVars);
    const whenFalse = inferExpressionShape(expr.whenFalse, sourceFile, importedApis, localVars);
    const allShapes = [whenTrue, whenFalse].filter((s): s is ReactivityShape => s !== null);
    return allShapes.length > 0 ? mostReactiveShape(allShapes) : null;
  }

  return null;
}

/**
 * Infer shape from a variable initializer (non-function).
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
  let name: string | undefined;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    name = node.name?.getText(sourceFile);
  }

  if (name && !/^[A-Z]/.test(name)) {
    return false;
  }

  if (node.body) {
    return containsJsxReturn(node.body, sourceFile);
  }
  return false;
}

function containsJsxReturn(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
  if (ts.isReturnStatement(node) && node.expression) {
    return isJsxExpression(node.expression);
  }

  if (isJsxExpression(node)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (found) return;
    // Skip nested function/method bodies
    if (isNestedFunctionLike(child)) return;
    if (containsJsxReturn(child, _sourceFile)) {
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
    (ts.isParenthesizedExpression(node) && isJsxExpression(node.expression))
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
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    !mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

function hasDefaultExportModifier(node: ts.Statement): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

function stripQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, '');
}

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
