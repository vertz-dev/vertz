/**
 * Prefetch manifest generator — produces a route → component → query mapping
 * for SSR single-pass prefetching via static AST analysis.
 *
 * Uses ts.createSourceFile() for performance (no type checker needed).
 * Reuses import resolution from manifest-resolver.ts.
 */
import { ts } from 'ts-morph';

// ─── Types ──────────────────────────────────────────────────────

export interface ExtractedQuery {
  /** Descriptor factory chain, e.g. 'api.issues.list' or 'api.projects.get' */
  descriptorChain: string;
}

export interface ComponentAnalysis {
  /** All query() calls found in the component */
  queries: ExtractedQuery[];
  /** Route params from useParams() destructuring */
  params: string[];
}

export interface ImportInfo {
  localName: string;
  originalName: string;
  source: string;
}

export interface ManifestRoute {
  pattern: string;
  componentName: string;
  type: 'layout' | 'page';
  file?: string;
  queries: ExtractedQuery[];
  params: string[];
}

export interface PrefetchManifest {
  routes: ManifestRoute[];
  unanalyzable: Array<{ pattern: string; file?: string; reason: string }>;
  generatedAt: string;
}

export interface GeneratePrefetchManifestOptions {
  routerSource: string;
  routerPath: string;
  readFile: (path: string) => string | undefined;
  resolveImport: (specifier: string, fromFile: string) => string | undefined;
}

export interface ExtractedRoute {
  /** Full route pattern (e.g., '/projects/:projectId/board') */
  pattern: string;
  /** Component name referenced in the route (e.g., 'ProjectBoardPage') */
  componentName: string;
  /** Whether this is a layout (has children) or a page (leaf) */
  type: 'layout' | 'page';
  /** Child routes (before flattening) */
  children?: ExtractedRoute[];
}

// ─── Route Extraction ───────────────────────────────────────────

/**
 * Extract routes from a source file containing defineRoutes() calls.
 * Returns a flat list of routes with their component references.
 */
export function extractRoutes(sourceText: string, filePath: string): ExtractedRoute[] {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  // Find defineRoutes(...) call
  const routeObj = findDefineRoutesArg(sf);
  if (!routeObj) return [];

  // Parse the object literal into routes
  const nested = parseRouteObject(routeObj, sf);

  // Flatten nested routes into full patterns
  return flattenRoutes(nested, '');
}

// ─── Internal Helpers ───────────────────────────────────────────

function findDefineRoutesArg(sf: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  let result: ts.ObjectLiteralExpression | undefined;

  function visit(node: ts.Node): void {
    if (result) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineRoutes' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
  return result;
}

function parseRouteObject(obj: ts.ObjectLiteralExpression, sf: ts.SourceFile): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;

    const pattern = stripQuotes(prop.name.getText(sf));
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;

    const routeObj = prop.initializer;
    let componentName: string | undefined;
    let children: ExtractedRoute[] | undefined;

    for (const inner of routeObj.properties) {
      if (!ts.isPropertyAssignment(inner)) continue;
      const key = inner.name.getText(sf);

      if (key === 'component') {
        componentName = extractComponentName(inner.initializer, sf);
      } else if (key === 'children' && ts.isObjectLiteralExpression(inner.initializer)) {
        children = parseRouteObject(inner.initializer, sf);
      }
    }

    if (componentName) {
      const hasChildren = children && children.length > 0;
      routes.push({
        pattern,
        componentName,
        type: hasChildren ? 'layout' : 'page',
        children: hasChildren ? children : undefined,
      });
    }
  }

  return routes;
}

/**
 * Extract the outermost component name from a route's component property value.
 * Handles: `() => <ComponentName />` and `() => <Wrapper>...</Wrapper>` (extracts `Wrapper`).
 */
function extractComponentName(expr: ts.Expression, sf: ts.SourceFile): string | undefined {
  // Unwrap arrow function: () => <Foo />
  if (ts.isArrowFunction(expr)) {
    return extractComponentNameFromExpr(expr.body as ts.Expression, sf);
  }
  return undefined;
}

function extractComponentNameFromExpr(expr: ts.Expression, sf: ts.SourceFile): string | undefined {
  if (ts.isParenthesizedExpression(expr)) {
    return extractComponentNameFromExpr(expr.expression, sf);
  }
  // <ComponentName /> — self-closing
  if (ts.isJsxSelfClosingElement(expr)) {
    return expr.tagName.getText(sf);
  }
  // <ComponentName>...</ComponentName>
  if (ts.isJsxElement(expr)) {
    return expr.openingElement.tagName.getText(sf);
  }
  return undefined;
}

function flattenRoutes(routes: ExtractedRoute[], parentPattern: string): ExtractedRoute[] {
  const flat: ExtractedRoute[] = [];

  for (const route of routes) {
    const fullPattern = joinPatterns(parentPattern, route.pattern);

    flat.push({
      pattern: fullPattern,
      componentName: route.componentName,
      type: route.type,
    });

    if (route.children) {
      flat.push(...flattenRoutes(route.children, fullPattern));
    }
  }

  return flat;
}

function joinPatterns(parent: string, child: string): string {
  if (!parent) return child;
  if (child === '/') return parent;
  // Remove trailing slash from parent before joining
  const base = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return `${base}${child}`;
}

function stripQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, '');
}

// ─── Component Query Extraction ─────────────────────────────────

/**
 * Analyze a component file to find query() calls and useParams() dependencies.
 * Extracts descriptor factory chains (e.g., 'api.issues.list') and route params.
 */
export function analyzeComponentQueries(sourceText: string, filePath: string): ComponentAnalysis {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const queries: ExtractedQuery[] = [];
  const params: string[] = [];

  function visit(node: ts.Node): void {
    // Detect query(...) calls
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'query' &&
      node.arguments.length > 0
    ) {
      const chain = extractDescriptorChain(node.arguments[0], sf);
      if (chain) {
        queries.push({ descriptorChain: chain });
      }
    }

    // Detect useParams() destructuring
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isObjectBindingPattern(decl.name) &&
          decl.initializer &&
          ts.isCallExpression(decl.initializer) &&
          ts.isIdentifier(decl.initializer.expression) &&
          decl.initializer.expression.text === 'useParams'
        ) {
          for (const el of decl.name.elements) {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
              params.push(el.name.text);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
  return { queries, params };
}

/**
 * Extract the descriptor factory chain from a query() argument.
 * Handles:
 * - api.projects.list()        → 'api.projects.list'
 * - api.projects.get(id)       → 'api.projects.get'
 * - api.issues.list({ ... })   → 'api.issues.list'
 */
function extractDescriptorChain(arg: ts.Expression, sf: ts.SourceFile): string | undefined {
  // query(api.entity.method(...)) — the arg is a call expression
  if (ts.isCallExpression(arg)) {
    return extractPropertyAccessChain(arg.expression, sf);
  }
  // query(descriptor) — a variable reference (unusual but possible)
  if (ts.isIdentifier(arg)) {
    return arg.text;
  }
  return undefined;
}

/**
 * Extract a property access chain like api.projects.list → 'api.projects.list'
 */
function extractPropertyAccessChain(expr: ts.Expression, _sf: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const left = extractPropertyAccessChain(expr.expression, _sf);
    if (left) {
      return `${left}.${expr.name.text}`;
    }
  }
  return undefined;
}

// ─── Import Collection ──────────────────────────────────────────

/**
 * Collect all named imports from a source file.
 */
export function collectImports(sourceText: string, filePath: string): ImportInfo[] {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const imports: ImportInfo[] = [];

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const source = stripQuotes(stmt.moduleSpecifier.getText(sf));
    const clause = stmt.importClause;
    if (!clause) continue;

    // Named imports: import { Foo, Bar } from '...'
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const originalName = el.propertyName?.getText(sf) ?? el.name.getText(sf);
        const localName = el.name.getText(sf);
        imports.push({ localName, originalName, source });
      }
    }

    // Default import: import Foo from '...'
    if (clause.name) {
      imports.push({
        localName: clause.name.getText(sf),
        originalName: 'default',
        source,
      });
    }
  }

  return imports;
}

// ─── Full Manifest Generation ───────────────────────────────────

/**
 * Generate a complete prefetch manifest from a router file and its component graph.
 *
 * 1. Extract routes from defineRoutes() in the router source
 * 2. Collect imports to map component names → file paths
 * 3. Read each component file and analyze for query() calls
 * 4. Produce the full manifest
 */
export function generatePrefetchManifest(
  options: GeneratePrefetchManifestOptions,
): PrefetchManifest {
  const { routerSource, routerPath, readFile, resolveImport } = options;

  // 1. Extract routes
  const routes = extractRoutes(routerSource, routerPath);

  // 2. Collect imports from router to map component names → module specifiers
  const imports = collectImports(routerSource, routerPath);
  const importMap = new Map<string, string>();
  for (const imp of imports) {
    importMap.set(imp.localName, imp.source);
  }

  // 3. For each route, resolve the component file and analyze for queries
  const manifestRoutes: ManifestRoute[] = [];
  const unanalyzable: Array<{ pattern: string; file?: string; reason: string }> = [];

  for (const route of routes) {
    const specifier = importMap.get(route.componentName);
    let file: string | undefined;
    let queries: ExtractedQuery[] = [];
    let params: string[] = [];

    if (!specifier) {
      unanalyzable.push({
        pattern: route.pattern,
        reason: `Component '${route.componentName}' not found in router imports`,
      });
    } else {
      file = resolveImport(specifier, routerPath);
      if (!file) {
        unanalyzable.push({
          pattern: route.pattern,
          reason: `Could not resolve import '${specifier}' for component '${route.componentName}'`,
        });
      } else {
        const source = readFile(file);
        if (!source) {
          unanalyzable.push({
            pattern: route.pattern,
            file,
            reason: `Could not read file '${file}' for component '${route.componentName}'`,
          });
        } else {
          const analysis = analyzeComponentQueries(source, file);
          queries = analysis.queries;
          params = analysis.params;
        }
      }
    }

    manifestRoutes.push({
      pattern: route.pattern,
      componentName: route.componentName,
      type: route.type,
      file,
      queries,
      params,
    });
  }

  return {
    routes: manifestRoutes,
    unanalyzable,
    generatedAt: new Date().toISOString(),
  };
}
