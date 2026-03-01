import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import {
  getSignalApiConfig,
  isReactiveSourceApi,
  isSignalApi,
  type SignalApiConfig,
} from '../signal-api-registry';
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

    // Build import alias maps for signal APIs and reactive source APIs
    const { signalApiAliases: importAliases, reactiveSourceAliases } =
      buildImportAliasMap(sourceFile);

    // Collect all declared variable names to avoid synthetic name collisions
    const declaredNames = collectDeclaredNames(bodyNode);

    // Pass 1: Collect declarations
    const lets = new Map<string, { start: number; end: number; deps: string[] }>();
    const consts = new Map<string, { start: number; end: number; deps: string[] }>();
    const signalApiVars = new Map<string, SignalApiConfig>(); // Track variables assigned from signal APIs
    const reactiveSourceVars = new Set<string>(); // Track variables assigned from reactive source APIs (e.g., useContext)
    const destructuredFromMap = new Map<string, string>(); // binding name → synthetic var name
    const syntheticCounters = new Map<string, number>(); // API name → counter for unique naming

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
          // Check if the initializer is a signal API call
          let signalApiConfig: SignalApiConfig | undefined;
          let syntheticName: string | undefined;

          const hasUnsupportedBindings = nameNode
            .getElements()
            .some(
              (el) =>
                el.getInitializer() || el.getNameNode().isKind(SyntaxKind.ObjectBindingPattern),
            );

          if (isConst && !hasUnsupportedBindings && init?.isKind(SyntaxKind.CallExpression)) {
            const callExpr = init.asKindOrThrow(SyntaxKind.CallExpression);
            const callName = callExpr.getExpression();
            if (callName.isKind(SyntaxKind.Identifier)) {
              const fnName = callName.getText();
              const originalName = importAliases.get(fnName);
              if (originalName) {
                signalApiConfig = getSignalApiConfig(originalName);
                if (signalApiConfig) {
                  let counter = syntheticCounters.get(originalName) ?? 0;
                  syntheticName = `__${originalName}_${counter}`;
                  while (declaredNames.has(syntheticName)) {
                    counter++;
                    syntheticName = `__${originalName}_${counter}`;
                  }
                  syntheticCounters.set(originalName, counter + 1);

                  // Register the synthetic variable with signal API config
                  signalApiVars.set(syntheticName, signalApiConfig);
                  consts.set(syntheticName, {
                    start: decl.getStart(),
                    end: decl.getEnd(),
                    deps: [],
                  });
                }
              }
            }
          }

          for (const element of nameNode.getElements()) {
            const bindingName = element.getName();
            const propName = element.getPropertyNameNode()?.getText() ?? bindingName;

            if (signalApiConfig && syntheticName) {
              // Classify based on registry: signal props are computed, everything else is static
              const isSignalProp = signalApiConfig.signalProperties.has(propName);
              const deps = isSignalProp ? [syntheticName] : [];
              const entry = { start: decl.getStart(), end: decl.getEnd(), deps };
              consts.set(bindingName, entry);
              destructuredFromMap.set(bindingName, syntheticName);
            } else {
              const deps = init ? collectIdentifierRefs(init) : [];
              const entry = { start: decl.getStart(), end: decl.getEnd(), deps };
              if (isLet) {
                lets.set(bindingName, entry);
              } else if (isConst) {
                consts.set(bindingName, entry);
              }
            }
          }
          continue;
        }

        const name = decl.getName();
        const deps = init ? collectIdentifierRefs(init) : [];
        const entry = { start: decl.getStart(), end: decl.getEnd(), deps };

        // Check if this is assigned from a signal API call or reactive source API call
        if (init?.isKind(SyntaxKind.CallExpression)) {
          const callExpr = init.asKindOrThrow(SyntaxKind.CallExpression);
          const callName = callExpr.getExpression();
          if (callName.isKind(SyntaxKind.Identifier)) {
            const fnName = callName.getText();
            // Signal API check
            const originalName = importAliases.get(fnName);
            if (originalName) {
              const config = getSignalApiConfig(originalName);
              if (config) {
                signalApiVars.set(name, config);
              }
            }
            // Reactive source API check
            if (reactiveSourceAliases.has(fnName)) {
              reactiveSourceVars.add(name);
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

    // Computeds: `const` vars that depend (directly or transitively) on a signal,
    // a computed, or a signal API variable (query, form, createLoader)
    const computeds = new Set<string>();
    changed = true;
    while (changed) {
      changed = false;
      for (const [name, info] of consts) {
        if (computeds.has(name)) continue;
        const dependsOnReactive = info.deps.some(
          (dep) =>
            signals.has(dep) ||
            computeds.has(dep) ||
            signalApiVars.has(dep) ||
            reactiveSourceVars.has(dep),
        );
        if (dependsOnReactive) {
          computeds.add(name);
          changed = true;
        }
      }
    }

    // Build results
    const results: VariableInfo[] = [];

    for (const [name, info] of lets) {
      const varInfo: VariableInfo = {
        name,
        kind: signals.has(name) ? 'signal' : 'static',
        start: info.start,
        end: info.end,
      };
      const apiConfig = signalApiVars.get(name);
      if (apiConfig) {
        varInfo.signalProperties = apiConfig.signalProperties;
        varInfo.plainProperties = apiConfig.plainProperties;
        varInfo.fieldSignalProperties = apiConfig.fieldSignalProperties;
      }
      results.push(varInfo);
    }

    for (const [name, info] of consts) {
      const varInfo: VariableInfo = {
        name,
        kind: computeds.has(name) ? 'computed' : 'static',
        start: info.start,
        end: info.end,
      };
      const apiConfig = signalApiVars.get(name);
      if (apiConfig) {
        varInfo.signalProperties = apiConfig.signalProperties;
        varInfo.plainProperties = apiConfig.plainProperties;
        varInfo.fieldSignalProperties = apiConfig.fieldSignalProperties;
      }
      if (reactiveSourceVars.has(name)) {
        varInfo.isReactiveSource = true;
      }
      const syntheticSource = destructuredFromMap.get(name);
      if (syntheticSource) {
        varInfo.destructuredFrom = syntheticSource;
      }
      results.push(varInfo);
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
 * Build maps of imported API names from @vertz/ui.
 * - signalApiAliases: local name → original name for signal APIs (query, form, etc.)
 * - reactiveSourceAliases: set of local names for reactive source APIs (useContext)
 */
function buildImportAliasMap(sourceFile: SourceFile): {
  signalApiAliases: Map<string, string>;
  reactiveSourceAliases: Set<string>;
} {
  const signalApiAliases = new Map<string, string>();
  const reactiveSourceAliases = new Set<string>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    // Only process imports from @vertz/ui
    if (moduleSpecifier !== '@vertz/ui') continue;

    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      const originalName = namedImport.getName();
      const localName = namedImport.getAliasNode()?.getText() ?? originalName;

      if (isSignalApi(originalName)) {
        signalApiAliases.set(localName, originalName);
      }
      if (isReactiveSourceApi(originalName)) {
        reactiveSourceAliases.add(localName);
      }
    }
  }

  return { signalApiAliases, reactiveSourceAliases };
}

/** Collect all declared variable names in a component body. */
function collectDeclaredNames(bodyNode: Node): Set<string> {
  const names = new Set<string>();
  for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
    if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
    const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
    if (!declList) continue;
    for (const decl of declList.getDeclarations()) {
      const nameNode = decl.getNameNode();
      if (nameNode.isKind(SyntaxKind.Identifier)) {
        names.add(nameNode.getText());
      }
    }
  }
  return names;
}
