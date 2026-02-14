import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { getSignalApiConfig, isSignalApi } from '../signal-api-registry';
import type { ComponentInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Two-pass taint analysis classifying variables as signal, computed, or static.
 *
 * Pass 1: Collect all `let` and `const` declarations in the component body,
 *         along with their dependency references.
 * Pass 2: Starting from JSX-referenced identifiers, trace backwards through
 *         const dependency chains to find which `let` vars are "needed" by JSX.
 *         Those `let` vars become signals, and the intermediate consts become computeds.
 */
export class ReactivityAnalyzer {
  analyze(sourceFile: SourceFile, component: ComponentInfo): VariableInfo[] {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    // Track import aliases: map from alias → original name
    // Example: import { query as q } → importAliases.set('q', 'query')
    const importAliases = collectImportAliases(sourceFile);

    // Pass 1: Collect declarations
    const lets = new Map<string, { start: number; end: number; deps: string[] }>();
    const consts = new Map<string, { start: number; end: number; deps: string[] }>();
    const signalObjects = new Map<
      string,
      { start: number; end: number; signalProperties: Set<string> }
    >();

    for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
      if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
      const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
      if (!declList) continue;

      const declText = declList.getText();
      const isLet = declText.startsWith('let ');
      const isConst = declText.startsWith('const ');

      for (const decl of declList.getDeclarations()) {
        const nameNode = decl.getNameNode();
        const init = decl.getInitializer();

        // Handle destructuring: let { a, b } = expr
        if (nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
          const deps = init ? collectIdentifierRefs(init) : [];
          for (const element of nameNode.getElements()) {
            const bindingName = element.getName();
            const entry = { start: decl.getStart(), end: decl.getEnd(), deps };
            if (isLet) {
              lets.set(bindingName, entry);
            } else if (isConst) {
              consts.set(bindingName, entry);
            }
          }
          continue;
        }

        const name = decl.getName();
        const deps = init ? collectIdentifierRefs(init) : [];
        const entry = { start: decl.getStart(), end: decl.getEnd(), deps };

        // Check if this const is initialized with a signal API call
        if (isConst && init) {
          const apiName = extractSignalApiCall(init, importAliases);
          if (apiName) {
            const config = getSignalApiConfig(apiName);
            if (config) {
              signalObjects.set(name, {
                start: decl.getStart(),
                end: decl.getEnd(),
                signalProperties: new Set(config.signalProperties),
              });
              continue; // Don't add to regular consts
            }
          }
        }

        if (isLet) {
          lets.set(name, entry);
        } else if (isConst) {
          consts.set(name, entry);
        }
      }
    }

    // Collect all identifiers used in JSX expressions
    const jsxRefs = collectJsxReferencedIdentifiers(bodyNode);

    // Pass 2: Trace backwards from JSX to find which `let` vars are needed.
    //
    // A `let` is a signal if it's referenced in JSX directly OR transitively
    // through a chain of consts that ultimately reaches JSX.
    //
    // Algorithm: compute the set of identifiers that are "JSX-reachable".
    // Start with direct JSX refs, then expand: if a const is JSX-reachable,
    // all its deps are also JSX-reachable (they contribute to its value).

    const jsxReachable = new Set(jsxRefs);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, info] of consts) {
        if (jsxReachable.has(name)) {
          // This const is JSX-reachable, so its deps are too
          for (const dep of info.deps) {
            if (!jsxReachable.has(dep)) {
              jsxReachable.add(dep);
              changed = true;
            }
          }
        }
      }
    }

    // Signals: `let` vars that are JSX-reachable
    const signals = new Set<string>();
    for (const name of lets.keys()) {
      if (jsxReachable.has(name)) {
        signals.add(name);
      }
    }

    // Computeds: `const` vars that depend (directly or transitively) on a signal
    // and are JSX-reachable
    const computeds = new Set<string>();
    changed = true;
    while (changed) {
      changed = false;
      for (const [name, info] of consts) {
        if (computeds.has(name)) continue;
        const dependsOnReactive = info.deps.some((dep) => signals.has(dep) || computeds.has(dep));
        if (dependsOnReactive) {
          computeds.add(name);
          changed = true;
        }
      }
    }

    // Build results
    const results: VariableInfo[] = [];

    for (const [name, info] of lets) {
      results.push({
        name,
        kind: signals.has(name) ? 'signal' : 'static',
        start: info.start,
        end: info.end,
      });
    }

    for (const [name, info] of consts) {
      results.push({
        name,
        kind: computeds.has(name) ? 'computed' : 'static',
        start: info.start,
        end: info.end,
      });
    }

    // Add signal-object entries
    for (const [name, info] of signalObjects) {
      results.push({
        name,
        kind: 'signal-object',
        start: info.start,
        end: info.end,
        signalProperties: info.signalProperties,
      });
    }

    return results;
  }
}

/** Collect all identifier names referenced in JSX expressions. */
function collectJsxReferencedIdentifiers(bodyNode: Node): Set<string> {
  const refs = new Set<string>();
  const jsxExprs = bodyNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
  for (const expr of jsxExprs) {
    addIdentifiers(expr, refs);
  }
  return refs;
}

/** Recursively collect Identifier names from a node. */
function addIdentifiers(node: Node, refs: Set<string>): void {
  if (node.isKind(SyntaxKind.Identifier)) {
    refs.add(node.getText());
  }
  for (const child of node.getChildren()) {
    addIdentifiers(child, refs);
  }
}

/** Collect identifier refs from an initializer expression. */
function collectIdentifierRefs(node: Node): string[] {
  const refs: string[] = [];
  const walk = (n: Node): void => {
    if (n.isKind(SyntaxKind.Identifier)) {
      refs.push(n.getText());
    }
    for (const c of n.getChildren()) {
      walk(c);
    }
  };
  walk(node);
  return refs;
}

/**
 * Collect import aliases from the source file.
 * Returns a map from alias/imported name → original name.
 *
 * Examples:
 * - import { query } → map.set('query', 'query')
 * - import { query as q } → map.set('q', 'query')
 * - import * as vertz → map.set('vertz', '*')
 */
function collectImportAliases(sourceFile: SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    // Named imports: import { query, form as f }
    for (const namedImport of importDecl.getNamedImports()) {
      const aliasNode = namedImport.getAliasNode();
      const name = namedImport.getName();

      if (aliasNode) {
        // import { query as q } → aliases.set('q', 'query')
        aliases.set(aliasNode.getText(), name);
      } else {
        // import { query } → aliases.set('query', 'query')
        aliases.set(name, name);
      }
    }

    // Namespace import: import * as vertz
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      aliases.set(namespaceImport.getText(), '*');
    }
  }

  return aliases;
}

/**
 * Extract the name of a signal API call from an initializer expression.
 * Returns the function name if it's a registered signal API, otherwise null.
 *
 * Examples:
 *   query(...) -> "query"
 *   q(...) where q is alias for query -> "query"
 *   form(...) -> "form"
 *   vertz.query(...) -> "query"
 *   someOtherFunc(...) -> null
 */
function extractSignalApiCall(node: Node, importAliases: Map<string, string>): string | null {
  // Direct call: query(...) or q(...) where q is an alias for query
  if (node.isKind(SyntaxKind.CallExpression)) {
    const expr = node.getExpression();

    // Simple identifier: query(...) or q(...)
    if (expr.isKind(SyntaxKind.Identifier)) {
      const name = expr.getText();
      // Resolve alias: q → query
      const originalName = importAliases.get(name) ?? name;
      return isSignalApi(originalName) ? originalName : null;
    }

    // Property access: vertz.query(...), UI.form(...)
    if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const propName = expr.getName();
      return isSignalApi(propName) ? propName : null;
    }
  }

  return null;
}
