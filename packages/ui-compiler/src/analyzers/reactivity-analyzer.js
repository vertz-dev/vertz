import { SyntaxKind } from 'ts-morph';
import { getSignalApiConfig, isSignalApi } from '../signal-api-registry';
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
  analyze(sourceFile, component) {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];
    // Build import alias map for signal APIs
    const importAliases = buildImportAliasMap(sourceFile);
    // Pass 1: Collect declarations
    const lets = new Map();
    const consts = new Map();
    const signalApiVars = new Map(); // Track variables assigned from signal APIs
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
        // Check if this is assigned from a signal API call
        if (init?.isKind(SyntaxKind.CallExpression)) {
          const callExpr = init.asKindOrThrow(SyntaxKind.CallExpression);
          const callName = callExpr.getExpression();
          if (callName.isKind(SyntaxKind.Identifier)) {
            const fnName = callName.getText();
            // Check both direct name and aliased name
            const originalName = importAliases.get(fnName) ?? fnName;
            if (isSignalApi(originalName)) {
              const config = getSignalApiConfig(originalName);
              if (config) {
                signalApiVars.set(name, config.signalProperties);
              }
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
    const signals = new Set();
    for (const name of lets.keys()) {
      if (jsxReachable.has(name)) {
        signals.add(name);
      }
    }
    // Computeds: `const` vars that depend (directly or transitively) on a signal
    // and are JSX-reachable
    const computeds = new Set();
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
    const results = [];
    for (const [name, info] of lets) {
      const varInfo = {
        name,
        kind: signals.has(name) ? 'signal' : 'static',
        start: info.start,
        end: info.end,
      };
      if (signalApiVars.has(name)) {
        varInfo.signalProperties = signalApiVars.get(name);
      }
      results.push(varInfo);
    }
    for (const [name, info] of consts) {
      const varInfo = {
        name,
        kind: computeds.has(name) ? 'computed' : 'static',
        start: info.start,
        end: info.end,
      };
      if (signalApiVars.has(name)) {
        varInfo.signalProperties = signalApiVars.get(name);
      }
      results.push(varInfo);
    }
    return results;
  }
}
/** Collect all identifier names referenced in JSX expressions. */
function collectJsxReferencedIdentifiers(bodyNode) {
  const refs = new Set();
  const jsxExprs = bodyNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
  for (const expr of jsxExprs) {
    addIdentifiers(expr, refs);
  }
  return refs;
}
/** Recursively collect Identifier names from a node. */
function addIdentifiers(node, refs) {
  if (node.isKind(SyntaxKind.Identifier)) {
    refs.add(node.getText());
  }
  for (const child of node.getChildren()) {
    addIdentifiers(child, refs);
  }
}
/** Collect identifier refs from an initializer expression. */
function collectIdentifierRefs(node) {
  const refs = [];
  const walk = (n) => {
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
 * Build a map of import aliases for signal APIs.
 * Maps local name → original name (e.g., 'q' → 'query')
 */
function buildImportAliasMap(sourceFile) {
  const aliases = new Map();
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    // Only process imports from @vertz/ui
    if (moduleSpecifier !== '@vertz/ui') continue;
    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      const originalName = namedImport.getName();
      const aliasNode = namedImport.getAliasNode();
      if (aliasNode) {
        const aliasName = aliasNode.getText();
        // Only track if it's a signal API
        if (isSignalApi(originalName)) {
          aliases.set(aliasName, originalName);
        }
      }
    }
  }
  return aliases;
}
//# sourceMappingURL=reactivity-analyzer.js.map
