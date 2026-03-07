import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { loadFrameworkManifest } from '../reactivity-manifest';
import type { SignalApiConfig } from '../signal-api-registry';
import type { ComponentInfo, LoadedReactivityManifest, VariableInfo } from '../types';
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
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    manifests?: Record<string, LoadedReactivityManifest>,
  ): VariableInfo[] {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    // Build import alias maps for signal APIs and reactive source APIs
    const {
      signalApiAliases: importAliases,
      reactiveSourceAliases,
      manifestConfigs,
    } = buildImportAliasMap(sourceFile, manifests);

    const resolveSignalApiConfig = (originalName: string): SignalApiConfig | undefined => {
      return manifestConfigs.get(originalName);
    };

    // Collect all declared variable names to avoid synthetic name collisions
    const declaredNames = collectDeclaredNames(bodyNode);

    // Pass 1: Collect declarations
    const lets = new Map<
      string,
      { start: number; end: number; deps: string[]; propertyAccesses: Map<string, Set<string>> }
    >();
    const consts = new Map<
      string,
      {
        start: number;
        end: number;
        deps: string[];
        propertyAccesses: Map<string, Set<string>>;
        isFunctionDef: boolean;
      }
    >();
    const signalApiVars = new Map<string, SignalApiConfig>(); // Track variables assigned from signal APIs
    const reactiveSourceVars = new Set<string>(); // Track variables assigned from reactive source APIs (e.g., useContext)
    const destructuredFromMap = new Map<string, string>(); // binding name → synthetic var name
    const syntheticCounters = new Map<string, number>(); // API name → counter for unique naming

    // Classify component props as reactive sources (#964).
    // Props are passed as getter-backed objects, so any derived const must be computed.
    // Destructured props are always the component convention (the transform reverses them).
    // Named props only when the parameter is literally "props" or "__props" — factory
    // functions (e.g., ui-primitives) use "options"/"config" and must NOT be reactive.
    if (component.destructuredProps) {
      for (const binding of component.destructuredProps.bindings) {
        if (!binding.isRest) {
          reactiveSourceVars.add(binding.bindingName);
        }
      }
    } else if (component.propsParam === 'props' || component.propsParam === '__props') {
      reactiveSourceVars.add(component.propsParam);
    }

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
                signalApiConfig = resolveSignalApiConfig(originalName);
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
                    propertyAccesses: new Map(),
                    isFunctionDef: false,
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
              const propAccesses = new Map<string, Set<string>>();
              if (isSignalProp) {
                propAccesses.set(syntheticName, new Set([propName]));
              }
              const entry = {
                start: decl.getStart(),
                end: decl.getEnd(),
                deps,
                propertyAccesses: propAccesses,
                isFunctionDef: false,
              };
              consts.set(bindingName, entry);
              destructuredFromMap.set(bindingName, syntheticName);
            } else {
              const { refs: deps, propertyAccesses } = init
                ? collectDeps(init)
                : { refs: [] as string[], propertyAccesses: new Map<string, Set<string>>() };
              const entry = {
                start: decl.getStart(),
                end: decl.getEnd(),
                deps,
                propertyAccesses,
                isFunctionDef: false,
              };
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
        // Check if the initializer is a function definition (arrow function or function expression).
        // Function defs are stable references — they should never be wrapped in computed().
        // Unwrap type wrappers (parenthesized, as, satisfies) to find the underlying node.
        const unwrappedInit = init ? unwrapTypeWrappers(init) : undefined;
        const isFunctionDef =
          unwrappedInit?.isKind(SyntaxKind.ArrowFunction) === true ||
          unwrappedInit?.isKind(SyntaxKind.FunctionExpression) === true;
        const { refs: deps, propertyAccesses } = init
          ? collectDeps(init)
          : { refs: [] as string[], propertyAccesses: new Map<string, Set<string>>() };
        const entry = {
          start: decl.getStart(),
          end: decl.getEnd(),
          deps,
          propertyAccesses,
          isFunctionDef,
        };

        // Check if this is assigned from a signal API call or reactive source API call.
        // Unwrap NonNullExpression (the ! operator) to handle patterns like:
        //   const ctx = useContext(SomeCtx)!;
        let callInit = init;
        if (callInit?.isKind(SyntaxKind.NonNullExpression)) {
          callInit = callInit.getExpression();
        }
        if (callInit?.isKind(SyntaxKind.CallExpression)) {
          const callExpr = callInit.asKindOrThrow(SyntaxKind.CallExpression);
          const callName = callExpr.getExpression();
          if (callName.isKind(SyntaxKind.Identifier)) {
            const fnName = callName.getText();
            // Signal API check
            const originalName = importAliases.get(fnName);
            if (originalName) {
              const config = resolveSignalApiConfig(originalName);
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
    // a computed, or a signal API variable (query, form, createLoader).
    // Signal API vars themselves are excluded — they are constructor calls (form(), query()),
    // not pure derivations. Wrapping them in computed() would re-create them on every
    // evaluation, losing internal state (form fields, query cache, etc.).
    // Function definitions (arrow functions, function expressions) are excluded —
    // they are stable references. Reactivity is handled at call sites by the JSX runtime.
    const computeds = new Set<string>();
    changed = true;
    while (changed) {
      changed = false;
      for (const [name, info] of consts) {
        if (computeds.has(name)) continue;
        if (signalApiVars.has(name)) continue;
        if (info.isFunctionDef) continue;
        const dependsOnReactive = info.deps.some((dep) => {
          if (signals.has(dep) || computeds.has(dep) || reactiveSourceVars.has(dep)) return true;
          const apiConfig = signalApiVars.get(dep);
          if (apiConfig) {
            const accessed = info.propertyAccesses.get(dep);
            if (!accessed || accessed.size === 0) return false;
            return [...accessed].some((prop) => apiConfig.signalProperties.has(prop));
          }
          return false;
        });
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

/**
 * Collect identifier refs and property accesses from an initializer expression.
 * For PropertyAccessExpressions like `q.error`, records that `q` accesses property `error`.
 * This enables distinguishing reactive reads (signal properties) from stable references (plain methods).
 */
function collectDeps(node: Node): {
  refs: string[];
  propertyAccesses: Map<string, Set<string>>;
} {
  const refs: string[] = [];
  const propertyAccesses = new Map<string, Set<string>>();
  const walk = (n: Node): void => {
    if (n.isKind(SyntaxKind.PropertyAccessExpression)) {
      const expr = n.getExpression();
      const propName = n.getName();
      if (expr.isKind(SyntaxKind.Identifier)) {
        const varName = expr.getText();
        refs.push(varName);
        let props = propertyAccesses.get(varName);
        if (!props) {
          props = new Set();
          propertyAccesses.set(varName, props);
        }
        props.add(propName);
      } else {
        walk(expr);
      }
      return;
    }
    if (n.isKind(SyntaxKind.Identifier)) {
      refs.push(n.getText());
    }
    for (const c of n.getChildren()) {
      walk(c);
    }
  };
  walk(node);
  return { refs, propertyAccesses };
}

/**
 * Build maps of imported API names.
 *
 * When manifests are provided, uses them to classify imports from any module.
 * Falls back to the hardcoded signal API registry for @vertz/ui imports
 * when no manifest is available for a module.
 *
 * - signalApiAliases: local name → original name for signal APIs (query, form, etc.)
 * - reactiveSourceAliases: set of local names for reactive source APIs (useContext)
 */
function buildImportAliasMap(
  sourceFile: SourceFile,
  manifests?: Record<string, LoadedReactivityManifest>,
): {
  signalApiAliases: Map<string, string>;
  reactiveSourceAliases: Set<string>;
  manifestConfigs: Map<string, SignalApiConfig>;
} {
  const signalApiAliases = new Map<string, string>();
  const reactiveSourceAliases = new Set<string>();
  const manifestConfigs = new Map<string, SignalApiConfig>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    // Auto-load framework manifest for @vertz/ui when not explicitly provided
    const manifest =
      manifests?.[moduleSpecifier] ??
      (moduleSpecifier === '@vertz/ui' ? loadFrameworkManifest() : undefined);

    if (!manifest) continue;

    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      const originalName = namedImport.getName();
      const localName = namedImport.getAliasNode()?.getText() ?? originalName;

      const exportInfo = manifest.exports[originalName];
      if (exportInfo) {
        const { reactivity } = exportInfo;
        if (reactivity.type === 'signal-api') {
          signalApiAliases.set(localName, originalName);
          manifestConfigs.set(originalName, {
            signalProperties: reactivity.signalProperties,
            plainProperties: reactivity.plainProperties,
            ...(reactivity.fieldSignalProperties
              ? { fieldSignalProperties: reactivity.fieldSignalProperties }
              : {}),
          });
        } else if (reactivity.type === 'reactive-source') {
          reactiveSourceAliases.add(localName);
        }
      }
    }
  }

  return { signalApiAliases, reactiveSourceAliases, manifestConfigs };
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

/**
 * Unwrap TypeScript syntax wrappers to find the underlying expression.
 * Peels through ParenthesizedExpression, AsExpression, SatisfiesExpression,
 * and TypeAssertion nodes to expose the actual initializer kind.
 */
function unwrapTypeWrappers(node: Node): Node {
  let current = node;
  while (true) {
    if (current.isKind(SyntaxKind.ParenthesizedExpression)) {
      current = current.getExpression();
    } else if (current.isKind(SyntaxKind.AsExpression)) {
      current = current.getExpression();
    } else if (current.isKind(SyntaxKind.SatisfiesExpression)) {
      current = current.getExpression();
    } else if (current.isKind(SyntaxKind.TypeAssertionExpression)) {
      current = current.getExpression();
    } else {
      return current;
    }
  }
}
