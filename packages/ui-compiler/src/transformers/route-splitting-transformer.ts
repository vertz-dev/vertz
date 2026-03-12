/**
 * Route Splitting Transformer — Automatic per-page code splitting.
 *
 * Detects `defineRoutes({...})` calls and rewrites component factories
 * that reference static imports from local files into dynamic `import()` calls.
 * This enables Bun's bundler to create per-route chunks automatically.
 *
 * Only transforms when `defineRoutes` is imported from `@vertz/ui` or `@vertz/ui/router`.
 */

import MagicString from 'magic-string';
import type {
  CallExpression,
  ImportDeclaration,
  Node,
  ObjectLiteralExpression,
  SourceFile,
} from 'ts-morph';
import { Project, SyntaxKind, ts } from 'ts-morph';

/** Successful transform diagnostic. */
export interface RouteSplittingDiagnostic {
  routePath: string;
  importSource: string;
  symbolName: string;
}

/** Skipped route diagnostic. */
export interface RouteSplittingSkipped {
  routePath: string;
  reason:
    | 'block-body'
    | 'not-arrow-function'
    | 'not-imported-symbol'
    | 'package-import'
    | 'already-lazy'
    | 'symbol-used-elsewhere'
    | 'namespace-import'
    | 'dynamic-route-map'
    | 'spread-element';
}

/** Result of route splitting transform. */
export interface RouteSplittingResult {
  code: string;
  map: ReturnType<MagicString['generateMap']> | null;
  transformed: boolean;
  diagnostics: RouteSplittingDiagnostic[];
  skipped: RouteSplittingSkipped[];
}

/** Info about a static import symbol. */
interface ImportInfo {
  source: string;
  localName: string;
  /** The original exported name (differs from localName when aliased: `import { X as Y }`). */
  exportedName: string;
  isDefault: boolean;
  importDecl: ImportDeclaration;
}

/** Vertz package sources that export defineRoutes. */
const VERTZ_SOURCES = new Set(['@vertz/ui', '@vertz/ui/router']);

/**
 * Transform route definitions to use lazy imports for code splitting.
 */
export function transformRouteSplitting(source: string, filePath: string): RouteSplittingResult {
  const noChange: RouteSplittingResult = {
    code: source,
    map: null,
    transformed: false,
    diagnostics: [],
    skipped: [],
  };

  // Fast bail-out: no defineRoutes call
  if (!source.includes('defineRoutes(')) return noChange;

  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      strict: true,
    },
  });
  const sf = project.createSourceFile(filePath, source);

  // Check that defineRoutes is imported from a Vertz package
  const defineRoutesImport = findDefineRoutesImport(sf);
  if (!defineRoutesImport) return noChange;

  // Build import map: symbol name → ImportInfo
  const importMap = buildImportMap(sf);

  // Find all defineRoutes() calls
  const defineRoutesCalls = findDefineRoutesCalls(sf);
  if (defineRoutesCalls.length === 0) return noChange;

  const s = new MagicString(source);
  const diagnostics: RouteSplittingDiagnostic[] = [];
  const skipped: RouteSplittingSkipped[] = [];

  // Track which import symbols were lazified (for import cleanup)
  const lazifiedSymbols = new Set<string>();

  for (const call of defineRoutesCalls) {
    const arg = call.getArguments()[0];
    if (!arg || !arg.isKind(SyntaxKind.ObjectLiteralExpression)) {
      skipped.push({ routePath: '<unknown>', reason: 'dynamic-route-map' });
      continue;
    }

    processRouteObject(
      arg as ObjectLiteralExpression,
      s,
      importMap,
      sf,
      diagnostics,
      skipped,
      lazifiedSymbols,
    );
  }

  if (lazifiedSymbols.size === 0) {
    return { ...noChange, skipped };
  }

  // Remove or trim static imports that are now unused
  cleanupImports(s, sf, importMap, lazifiedSymbols);

  return {
    code: s.toString(),
    map: s.generateMap({ source: filePath, includeContent: true }),
    transformed: true,
    diagnostics,
    skipped,
  };
}

/** Find the import declaration that imports `defineRoutes` from a Vertz source. */
function findDefineRoutesImport(sf: SourceFile): ImportDeclaration | undefined {
  for (const imp of sf.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (!VERTZ_SOURCES.has(moduleSpecifier)) continue;

    for (const named of imp.getNamedImports()) {
      if (named.getName() === 'defineRoutes') return imp;
    }
  }
  return undefined;
}

/** Build a map of local symbol name → ImportInfo for all imports from relative paths. */
function buildImportMap(sf: SourceFile): Map<string, ImportInfo> {
  const map = new Map<string, ImportInfo>();

  for (const imp of sf.getImportDeclarations()) {
    const source = imp.getModuleSpecifierValue();
    // Only transform relative imports
    if (!source.startsWith('./') && !source.startsWith('../')) continue;

    // Default import
    const defaultImport = imp.getDefaultImport();
    if (defaultImport) {
      map.set(defaultImport.getText(), {
        source,
        localName: defaultImport.getText(),
        exportedName: 'default',
        isDefault: true,
        importDecl: imp,
      });
    }

    // Named imports
    for (const named of imp.getNamedImports()) {
      const localName = named.getAliasNode()?.getText() ?? named.getName();
      const exportedName = named.getName(); // Original export name (before alias)
      map.set(localName, {
        source,
        localName,
        exportedName,
        isDefault: false,
        importDecl: imp,
      });
    }
  }

  return map;
}

/** Find all call expressions that call `defineRoutes`. */
function findDefineRoutesCalls(sf: SourceFile): CallExpression[] {
  const calls: CallExpression[] = [];

  sf.forEachDescendant((node) => {
    if (node.isKind(SyntaxKind.CallExpression)) {
      const expr = (node as CallExpression).getExpression();
      if (expr.getText() === 'defineRoutes') {
        calls.push(node as CallExpression);
      }
    }
  });

  return calls;
}

/** Process a route object literal, transforming component factories. */
function processRouteObject(
  obj: ObjectLiteralExpression,
  s: MagicString,
  importMap: Map<string, ImportInfo>,
  sf: SourceFile,
  diagnostics: RouteSplittingDiagnostic[],
  skipped: RouteSplittingSkipped[],
  lazifiedSymbols: Set<string>,
): void {
  for (const prop of obj.getProperties()) {
    // Handle spread elements
    if (prop.isKind(SyntaxKind.SpreadAssignment)) {
      skipped.push({ routePath: '<spread>', reason: 'spread-element' });
      continue;
    }

    if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;

    const routePath = prop.getName();
    const init = prop.getInitializer();
    if (!init || !init.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

    const routeConfig = init as ObjectLiteralExpression;

    // Process `component` property
    const componentProp = routeConfig.getProperty('component');
    if (componentProp && componentProp.isKind(SyntaxKind.PropertyAssignment)) {
      const factory = componentProp.getInitializer();
      processComponentFactory(
        factory,
        routePath,
        s,
        importMap,
        sf,
        diagnostics,
        skipped,
        lazifiedSymbols,
      );
    }

    // Recurse into `children`
    const childrenProp = routeConfig.getProperty('children');
    if (childrenProp && childrenProp.isKind(SyntaxKind.PropertyAssignment)) {
      const childrenInit = childrenProp.getInitializer();
      if (childrenInit && childrenInit.isKind(SyntaxKind.ObjectLiteralExpression)) {
        processRouteObject(
          childrenInit as ObjectLiteralExpression,
          s,
          importMap,
          sf,
          diagnostics,
          skipped,
          lazifiedSymbols,
        );
      }
    }
  }
}

/** Process a single component factory and potentially rewrite it. */
function processComponentFactory(
  factory: Node | undefined,
  routePath: string,
  s: MagicString,
  importMap: Map<string, ImportInfo>,
  sf: SourceFile,
  diagnostics: RouteSplittingDiagnostic[],
  skipped: RouteSplittingSkipped[],
  lazifiedSymbols: Set<string>,
): void {
  if (!factory) return;

  // Must be an arrow function
  if (!factory.isKind(SyntaxKind.ArrowFunction)) {
    skipped.push({ routePath, reason: 'not-arrow-function' });
    return;
  }

  const arrow = factory;
  const body = arrow.getBody();

  // Must be an expression body (not a block)
  if (body.isKind(SyntaxKind.Block)) {
    skipped.push({ routePath, reason: 'block-body' });
    return;
  }

  // Check if body is already a dynamic import (already lazy)
  if (body.isKind(SyntaxKind.CallExpression)) {
    const callExpr = body.getExpression();
    if (callExpr.isKind(SyntaxKind.ImportKeyword)) {
      skipped.push({ routePath, reason: 'already-lazy' });
      return;
    }
  }

  // Extract the symbol name from the factory body
  let symbolName: string | undefined;
  let argsText = '';

  if (body.isKind(SyntaxKind.CallExpression)) {
    // () => X() or () => X(args)
    const callExpr = body.getExpression();
    if (callExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
      // Namespace import: pages.X() — bail out
      skipped.push({ routePath, reason: 'namespace-import' });
      return;
    }
    symbolName = callExpr.getText();
    const args = body.getArguments();
    if (args.length > 0) {
      argsText = args.map((a) => a.getText()).join(', ');
    }
  } else if (body.isKind(SyntaxKind.JsxSelfClosingElement)) {
    // () => <X /> or () => <X prop={val} />
    const tagName = body.getTagNameNode();
    symbolName = tagName.getText();
    const attrs = body.getAttributes();
    if (attrs.length > 0) {
      argsText = jsxAttrsToObjectLiteral(attrs);
    }
  } else if (body.isKind(SyntaxKind.JsxElement)) {
    // () => <X>...</X> — bail out for elements with children (complex case)
    skipped.push({ routePath, reason: 'block-body' });
    return;
  }

  if (!symbolName) {
    skipped.push({ routePath, reason: 'not-imported-symbol' });
    return;
  }

  // Look up in import map
  const importInfo = importMap.get(symbolName);
  if (!importInfo) {
    skipped.push({ routePath, reason: 'not-imported-symbol' });
    return;
  }

  // Check if symbol is used outside defineRoutes component factories
  if (isSymbolUsedElsewhere(sf, symbolName, factory)) {
    skipped.push({ routePath, reason: 'symbol-used-elsewhere' });
    return;
  }

  // Generate the lazy import replacement — use exportedName (not local alias)
  const memberAccess = importInfo.isDefault ? 'm.default' : `m.${importInfo.exportedName}`;
  const callArgs = argsText ? `(${argsText})` : '()';
  const lazyCode = `() => import('${importInfo.source}').then(m => ({ default: () => ${memberAccess}${callArgs} }))`;

  // Replace the factory expression
  s.overwrite(factory.getStart(), factory.getEnd(), lazyCode);

  lazifiedSymbols.add(symbolName);
  diagnostics.push({
    routePath,
    importSource: importInfo.source,
    symbolName,
  });
}

/** Convert JSX attributes to an object literal string for function call arguments. */
function jsxAttrsToObjectLiteral(attrs: Node[]): string {
  const props: string[] = [];
  for (const attr of attrs) {
    if (attr.isKind(SyntaxKind.JsxAttribute)) {
      const name = attr.getNameNode().getText();
      const initializer = attr.getInitializer();
      if (!initializer) {
        // Boolean attribute: <X disabled /> → { disabled: true }
        props.push(`${name}: true`);
      } else if (initializer.isKind(SyntaxKind.StringLiteral)) {
        props.push(`${name}: ${initializer.getText()}`);
      } else if (initializer.isKind(SyntaxKind.JsxExpression)) {
        const expr = initializer.getExpression();
        if (expr) {
          props.push(`${name}: ${expr.getText()}`);
        }
      }
    } else if (attr.isKind(SyntaxKind.JsxSpreadAttribute)) {
      const expr = attr.getExpression();
      props.push(`...${expr.getText()}`);
    }
  }
  return `{ ${props.join(', ')} }`;
}

/** Check if a symbol is used in the file outside of defineRoutes component factories. */
function isSymbolUsedElsewhere(sf: SourceFile, symbolName: string, _currentFactory: Node): boolean {
  let usedElsewhere = false;

  sf.forEachDescendant((node) => {
    if (usedElsewhere) return;
    if (!node.isKind(SyntaxKind.Identifier)) return;
    if (node.getText() !== symbolName) return;

    // Skip the import declaration itself
    const parent = node.getParent();
    if (parent?.isKind(SyntaxKind.ImportSpecifier) || parent?.isKind(SyntaxKind.ImportClause))
      return;

    // Skip if inside the current factory or any defineRoutes component factory
    if (isInsideComponentFactory(node)) return;

    usedElsewhere = true;
  });

  return usedElsewhere;
}

/** Check if a node is inside a component factory within defineRoutes. */
function isInsideComponentFactory(node: Node): boolean {
  let current: Node | undefined = node.getParent();
  let foundComponentProp = false;

  while (current) {
    // Check if we're inside a `component:` property assignment
    if (current.isKind(SyntaxKind.PropertyAssignment)) {
      const name = current.getName();
      if (name === 'component') {
        foundComponentProp = true;
      }
    }

    // Check if we're inside a defineRoutes() call
    if (current.isKind(SyntaxKind.CallExpression)) {
      const expr = current.getExpression();
      if (expr.getText() === 'defineRoutes' && foundComponentProp) {
        return true;
      }
    }

    current = current.getParent();
  }
  return false;
}

/** Remove or trim import declarations that are now unused after lazification. */
function cleanupImports(
  s: MagicString,
  sf: SourceFile,
  importMap: Map<string, ImportInfo>,
  lazifiedSymbols: Set<string>,
): void {
  // Group lazified symbols by import declaration
  const declsToUpdate = new Map<ImportDeclaration, Set<string>>();

  for (const symbolName of lazifiedSymbols) {
    const info = importMap.get(symbolName);
    if (!info) continue;

    const existing = declsToUpdate.get(info.importDecl) ?? new Set();
    existing.add(symbolName);
    declsToUpdate.set(info.importDecl, existing);
  }

  for (const [decl, removedSymbols] of declsToUpdate) {
    const defaultImport = decl.getDefaultImport();
    const namedImports = decl.getNamedImports();

    const hasDefaultRemoved = defaultImport && removedSymbols.has(defaultImport.getText());
    const remainingNamed = namedImports.filter(
      (n) => !removedSymbols.has(n.getAliasNode()?.getText() ?? n.getName()),
    );

    const totalSpecifiers = (defaultImport ? 1 : 0) + namedImports.length;
    const removedCount = removedSymbols.size;

    if (removedCount >= totalSpecifiers) {
      // Remove entire import declaration (including trailing newline)
      let end = decl.getEnd();
      const fullText = sf.getFullText();
      if (fullText[end] === '\n') end++;
      s.remove(decl.getStart(), end);
    } else {
      // Rebuild import declaration with remaining specifiers
      const source = decl.getModuleSpecifierValue();
      const parts: string[] = [];

      if (defaultImport && !hasDefaultRemoved) {
        parts.push(defaultImport.getText());
      }

      if (remainingNamed.length > 0) {
        const namedStr = remainingNamed.map((n) => n.getText()).join(', ');
        parts.push(`{ ${namedStr} }`);
      }

      const newImport = `import ${parts.join(', ')} from '${source}';`;
      s.overwrite(decl.getStart(), decl.getEnd(), newImport);
    }
  }
}
